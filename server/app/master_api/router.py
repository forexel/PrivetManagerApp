"""FastAPI router exposing the master-only contour."""

from __future__ import annotations

import uuid
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import verify_password
from app.master_api import security
from app.master_api import crud
from app.master_api import deps
from app.master_api.models import (
    MasterClient,
    MasterClientStatus,
    MasterDevice,
    MasterTariff,
    MasterUser,
    SupportSender,
)
from app.master_api.schemas import (
    ClientDetail,
    ClientProfileUpdate,
    ClientSummary,
    ContractConfirmRequest,
    ContractGenerateResponse,
    ContractRead,
    PaymentConfirmRequest,
    BillingNotifyRequest,
    MasterLoginRequest,
    MasterTokenResponse,
    MasterRead,
    PassportRead,
    PassportUpsert,
    DeviceCreate,
    DeviceRead,
    DeviceUpdate,
    DevicePhotoCreate,
    DevicePhotoRead,
    PresignedUploadRequest,
    PresignedUploadResponse,
    InvoiceRead,
    TariffCalculateRequest,
    TariffCalculateResponse,
    TariffRead,
    ClientsQuery,
)
from app.services.storage import storage_service
from app.services.contracts import build_contract_pdf
from app.services.support_bridge import SupportBridgeService

router = APIRouter(prefix="/api/master", tags=["master"])


def _full_name(client: MasterClient) -> str | None:
    if client.passport:
        names = [client.passport.last_name, client.passport.first_name, client.passport.middle_name]
        return " ".join(filter(None, names))
    if client.user and client.user.name:
        return client.user.name
    return None


def _device_to_schema(device: MasterDevice) -> DeviceRead:
    return DeviceRead(
        id=device.id,
        device_type=device.device_type,
        title=device.title,
        description=device.description,
        specs=device.specs or None,
        extra_fee=float(device.extra_fee or 0),
        created_at=device.created_at,
        updated_at=device.updated_at,
        photos=[
            DevicePhotoRead(
                id=photo.id,
                file_key=photo.file_key,
                created_at=photo.created_at,
                file_url=storage_service.get_public_url(photo.file_key),
            )
            for photo in device.photos
        ],
    )


def _tariff_to_schema(tariff: MasterTariff | None, client_tariff) -> TariffRead:
    if not client_tariff:
        return TariffRead(
            tariff_id=tariff.id if tariff else None,
            name=tariff.name if tariff else None,
            base_fee=float(tariff.base_fee) if tariff else None,
            extra_per_device=float(tariff.extra_per_device) if tariff else 1000.0,
            device_count=0,
            total_extra_fee=0,
            calculated_at=datetime.now(timezone.utc),
        )

    base_fee = float(client_tariff.tariff.base_fee) if client_tariff.tariff else None
    extra_per_device = (
        float(client_tariff.tariff.extra_per_device)
        if client_tariff.tariff
        else float(tariff.extra_per_device) if tariff else 1000.0
    )
    return TariffRead(
        tariff_id=client_tariff.tariff_id,
        name=client_tariff.tariff.name if client_tariff.tariff else tariff.name if tariff else None,
        base_fee=base_fee,
        extra_per_device=extra_per_device,
        device_count=client_tariff.device_count,
        total_extra_fee=float(client_tariff.total_extra_fee or 0),
        calculated_at=client_tariff.calculated_at,
    )


async def _get_client_or_404(
    db: AsyncSession,
    client_id: uuid.UUID,
) -> MasterClient:
    client = await crud.get_client(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


def _client_to_detail(client: MasterClient) -> ClientDetail:
    devices = [_device_to_schema(d) for d in client.devices]
    tariff_schema = None
    if client.tariff:
        tariff_schema = _tariff_to_schema(client.tariff.tariff, client.tariff)
    contract_schema = None
    if client.contract:
        contract_schema = ContractRead(
            otp_code=client.contract.otp_code,
            otp_sent_at=client.contract.otp_sent_at,
            signed_at=client.contract.signed_at,
            payment_confirmed_at=client.contract.payment_confirmed_at,
            contract_url=client.contract.contract_url,
            contract_number=client.contract.contract_number,
        )
    invoices = [
        InvoiceRead(
            id=invoice.id,
            amount=float(invoice.amount),
            description=invoice.description,
            contract_number=invoice.contract_number,
            due_date=invoice.due_date,
            status=invoice.status.value if hasattr(invoice.status, "value") else str(invoice.status),
            created_at=invoice.created_at,
        )
        for invoice in client.invoices
    ]

    return ClientDetail(
        id=client.id,
        status=client.status,
        assigned_master_id=client.assigned_master_id,
        support_ticket_id=client.support_ticket_id,
        user=client.user,
        passport=client.passport,
        devices=devices,
        tariff=tariff_schema,
        contract=contract_schema,
        invoices=invoices,
    )


async def _ensure_assignment(
    db: AsyncSession,
    *,
    client: MasterClient,
    master: MasterUser,
) -> MasterClient:
    if client.assigned_master_id is None:
        client = await crud.assign_master(db, client=client, master_id=master.id)
    return client


@router.post("/auth/login", response_model=MasterTokenResponse)
async def master_login(payload: MasterLoginRequest, db: AsyncSession = Depends(get_db)) -> MasterTokenResponse:
    master = await crud.get_master_by_email(db, payload.email)
    if not master or not master.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(payload.password, master.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token, expires_in = security.create_master_access_token(str(master.id), {"email": master.email})
    return MasterTokenResponse(access_token=token, expires_in=expires_in)


@router.get("/auth/me", response_model=MasterRead)
async def master_profile(current_master: MasterUser = Depends(deps.get_current_master)) -> MasterRead:
    return MasterRead.model_validate(current_master)


@router.get("/clients", response_model=list[ClientSummary])
async def list_master_clients(
    query: ClientsQuery = Depends(),
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> list[ClientSummary]:
    clients = await crud.list_clients(db, master_id=current_master.id, tab=query.tab)
    summaries: list[ClientSummary] = []
    for client in clients:
        summaries.append(
            ClientSummary(
                id=client.id,
                user_id=client.user_id,
                full_name=_full_name(client),
                phone=client.user.phone if client.user else "",
                email=client.user.email if client.user else None,
                status=client.status,
                assigned_master_id=client.assigned_master_id,
                support_ticket_id=client.support_ticket_id,
                created_at=client.created_at,
                updated_at=client.updated_at,
                devices_count=len(client.devices),
            )
        )
    return summaries


@router.get("/clients/{client_id}", response_model=ClientDetail)
async def get_master_client(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.post("/clients/{client_id}/contract/generate", response_model=ContractGenerateResponse)
async def generate_contract(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> ContractGenerateResponse:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, master=current_master)

    if not client.passport:
        raise HTTPException(status_code=400, detail="Passport data is required before contract generation")
    if not client.devices:
        raise HTTPException(status_code=400, detail="Add at least one device before contract generation")
    if not client.tariff:
        raise HTTPException(status_code=400, detail="Tariff calculation is required before contract generation")

    passport_snapshot = {
        "last_name": client.passport.last_name,
        "first_name": client.passport.first_name,
        "middle_name": client.passport.middle_name,
        "series": client.passport.series,
        "number": client.passport.number,
        "issued_by": client.passport.issued_by,
        "issue_code": client.passport.issue_code,
        "issue_date": client.passport.issue_date.isoformat(),
        "registration_address": client.passport.registration_address,
    }

    device_snapshot = [
        {
            "id": str(device.id),
            "device_type": device.device_type,
            "title": device.title,
            "description": device.description,
            "specs": device.specs or {},
            "extra_fee": float(device.extra_fee or 0),
            "photos": [photo.file_key for photo in device.photos],
        }
        for device in client.devices
    ]

    tariff_snapshot = {
        "tariff_id": str(client.tariff.tariff_id) if client.tariff.tariff_id else None,
        "device_count": client.tariff.device_count,
        "total_extra_fee": float(client.tariff.total_extra_fee or 0),
        "extra_per_device": float(
            client.tariff.tariff.extra_per_device if client.tariff and client.tariff.tariff else 1000.0
        ),
        "base_fee": float(client.tariff.tariff.base_fee) if client.tariff and client.tariff.tariff else 0,
    }
    if client.tariff.tariff:
        tariff_snapshot.update(
            name=client.tariff.tariff.name,
            base_fee=float(client.tariff.tariff.base_fee or 0),
            extra_per_device=float(client.tariff.tariff.extra_per_device or 0),
        )

    otp_code = f"{secrets.randbelow(900000) + 100000:06d}"
    contract_number = client.contract.contract_number if client.contract and client.contract.contract_number else f"CTR-{client.id.hex[:8].upper()}"
    now = datetime.now(timezone.utc)

    pdf_bytes = build_contract_pdf(
        contract_number=contract_number,
        passport_snapshot=passport_snapshot,
        devices=device_snapshot,
        tariff_snapshot=tariff_snapshot,
    )
    pdf_key = f"contracts/{client_id}/{contract_number}.pdf"
    storage_service.upload_bytes(key=pdf_key, data=pdf_bytes, content_type="application/pdf")
    contract_url = storage_service.get_public_url(pdf_key)

    contract = await crud.upsert_contract(
        db,
        client=client,
        data={
            "tariff_snapshot": tariff_snapshot,
            "passport_snapshot": passport_snapshot,
            "device_snapshot": device_snapshot,
            "otp_code": otp_code,
            "otp_sent_at": now,
            "contract_number": contract_number,
            "contract_url": contract_url,
        },
    )

    thread = await crud.ensure_support_thread(
        db,
        client=client,
        title="Подтверждение договора",
    )
    await crud.add_support_message(
        db,
        thread=thread,
        sender=SupportSender.SYSTEM,
        content=f"Код подтверждения договора: {otp_code}",
        payload={"otp_code": otp_code},
    )

    support_bridge = SupportBridgeService(db)
    ticket = await support_bridge.ensure_ticket(client)
    await support_bridge.post_support_message(
        ticket=ticket,
        body=f"Код подтверждения договора: {otp_code}",
    )

    client = await crud.set_client_status(db, client=client, status=MasterClientStatus.AWAITING_CONTRACT)
    return ContractGenerateResponse(
        contract_id=contract.id,
        otp_code=otp_code,
        contract_url=contract.contract_url,
        contract_number=contract.contract_number,
    )


@router.post("/clients/{client_id}/contract/confirm", response_model=ClientDetail)
async def confirm_contract(
    client_id: uuid.UUID,
    payload: ContractConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, master=current_master)
    if not client.contract:
        raise HTTPException(status_code=404, detail="Contract not generated")

    if client.contract.otp_code != payload.otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    now = datetime.now(timezone.utc)
    await crud.upsert_contract(db, client=client, data={"signed_at": now})
    client = await crud.set_client_status(db, client=client, status=MasterClientStatus.AWAITING_PAYMENT)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.post("/clients/{client_id}/payment/confirm", response_model=ClientDetail)
async def confirm_payment(
    client_id: uuid.UUID,
    payload: PaymentConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, master=current_master)
    if not client.contract:
        raise HTTPException(status_code=404, detail="Contract not generated")

    now = datetime.now(timezone.utc)
    await crud.upsert_contract(db, client=client, data={"payment_confirmed_at": now})
    client = await crud.set_client_status(db, client=client, status=MasterClientStatus.PROCESSED)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.post("/clients/{client_id}/billing/notify", response_model=ClientDetail)
async def notify_billing(
    client_id: uuid.UUID,
    payload: BillingNotifyRequest,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, master=current_master)

    await crud.create_invoice(
        db,
        client=client,
        amount=payload.amount,
        description=payload.description,
        contract_number=payload.contract_number,
        due_date=payload.due_date,
    )

    thread = await crud.ensure_support_thread(db, client=client, title="Подтверждение договора")
    await crud.add_support_message(
        db,
        thread=thread,
        sender=SupportSender.SYSTEM,
        content=(
            f"Выставлен счёт по договору {payload.contract_number}: {payload.amount:.2f} ₽."
            f" Оплатите до {payload.due_date.strftime('%d.%m.%Y')}"
        ),
        payload={
            "amount": payload.amount,
            "description": payload.description,
            "contract_number": payload.contract_number,
            "due_date": payload.due_date.isoformat(),
        },
    )

    support_bridge = SupportBridgeService(db)
    ticket = await support_bridge.ensure_ticket(client)
    await support_bridge.post_support_message(
        ticket=ticket,
        body=(
            f"Выставлен счёт по договору {payload.contract_number}: {payload.amount:.2f} ₽."
            f" Оплатите до {payload.due_date.strftime('%d.%m.%Y')}"
        ),
    )

    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.patch("/clients/{client_id}/profile", response_model=ClientDetail)
async def update_client_profile(
    client_id: uuid.UUID,
    payload: ClientProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, master=current_master)
    await crud.update_client_profile(db, client=client, payload=payload)
    if client.status == MasterClientStatus.NEW:
        client = await crud.set_client_status(db, client=client, status=MasterClientStatus.IN_VERIFICATION)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.put("/clients/{client_id}/passport", response_model=ClientDetail)
async def upsert_client_passport(
    client_id: uuid.UUID,
    payload: PassportUpsert,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, master=current_master)
    await crud.upsert_passport(db, client=client, payload=payload)
    if client.status == MasterClientStatus.NEW:
        client = await crud.set_client_status(db, client=client, status=MasterClientStatus.IN_VERIFICATION)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.post("/clients/{client_id}/devices", response_model=ClientDetail)
async def add_client_device(
    client_id: uuid.UUID,
    payload: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, master=current_master)
    await crud.create_device(db, client=client, payload=payload)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.patch("/clients/{client_id}/devices/{device_id}", response_model=ClientDetail)
async def update_client_device(
    client_id: uuid.UUID,
    device_id: uuid.UUID,
    payload: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, master=current_master)
    device = next((d for d in client.devices if d.id == device_id), None)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    await crud.update_device(db, device=device, payload=payload)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.delete("/clients/{client_id}/devices/{device_id}", response_model=ClientDetail)
async def delete_client_device(
    client_id: uuid.UUID,
    device_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, master=current_master)
    device = next((d for d in client.devices if d.id == device_id), None)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    await crud.delete_device(db, device=device)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.post("/clients/{client_id}/devices/{device_id}/photos/upload-url", response_model=PresignedUploadResponse)
async def create_device_photo_upload_url(
    client_id: uuid.UUID,
    device_id: uuid.UUID,
    payload: PresignedUploadRequest,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> PresignedUploadResponse:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, master=current_master)
    device = next((d for d in client.devices if d.id == device_id), None)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    prefix = f"clients/{client_id}/devices/{device_id}"
    presigned = storage_service.generate_presigned_post(key_prefix=prefix, content_type=payload.content_type)
    return PresignedUploadResponse(url=presigned.url, fields=presigned.fields, file_key=presigned.file_key)


@router.post("/clients/{client_id}/devices/{device_id}/photos", response_model=ClientDetail)
async def add_device_photo(
    client_id: uuid.UUID,
    device_id: uuid.UUID,
    payload: DevicePhotoCreate,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, master=current_master)
    device = next((d for d in client.devices if d.id == device_id), None)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    await crud.add_device_photo(db, device=device, file_key=payload.file_key)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.delete("/clients/{client_id}/devices/{device_id}/photos/{photo_id}", response_model=ClientDetail)
async def delete_device_photo(
    client_id: uuid.UUID,
    device_id: uuid.UUID,
    photo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, master=current_master)
    device = next((d for d in client.devices if d.id == device_id), None)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    photo = next((p for p in device.photos if p.id == photo_id), None)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    storage_service.delete_object(photo.file_key)
    await crud.remove_device_photo(db, photo=photo)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.post("/clients/{client_id}/tariff/calculate", response_model=TariffCalculateResponse)
async def calculate_tariff_endpoint(
    client_id: uuid.UUID,
    payload: TariffCalculateRequest,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> TariffCalculateResponse:
    client = await _get_client_or_404(db, client_id)
    tariff = None
    if payload.tariff_id:
        tariff = await crud.get_tariff_by_id(db, payload.tariff_id)
        if tariff is None:
            raise HTTPException(status_code=404, detail="Tariff not found")
    device_count, extra_per_device, total_extra = await crud.calculate_tariff(
        tariff=tariff,
        request=payload,
    )
    return TariffCalculateResponse(
        device_count=device_count,
        extra_per_device=extra_per_device,
        total_extra_fee=total_extra,
    )


@router.post("/clients/{client_id}/tariff/apply", response_model=ClientDetail)
async def apply_tariff_endpoint(
    client_id: uuid.UUID,
    payload: TariffCalculateRequest,
    db: AsyncSession = Depends(get_db),
    current_master: MasterUser = Depends(deps.get_current_master),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, master=current_master)
    tariff = None
    if payload.tariff_id:
        tariff = await crud.get_tariff_by_id(db, payload.tariff_id)
        if tariff is None:
            raise HTTPException(status_code=404, detail="Tariff not found")
    device_count, extra_per_device, total_extra = await crud.calculate_tariff(
        tariff=tariff,
        request=payload,
    )
    await crud.update_tariff(
        db,
        client=client,
        tariff=tariff,
        device_count=device_count,
        total_extra_fee=total_extra,
    )
    if client.status in {MasterClientStatus.NEW, MasterClientStatus.IN_VERIFICATION}:
        client = await crud.set_client_status(db, client=client, status=MasterClientStatus.AWAITING_CONTRACT)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)
