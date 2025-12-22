"""FastAPI router exposing the manager contour."""

from __future__ import annotations

import logging
import re
import uuid
import secrets
import hashlib
import hmac
from datetime import datetime, timezone
from decimal import Decimal
import json

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Response, Request
import os
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.config import settings
from app.core.security import verify_password
from app.manager_api import security
from app.manager_api import crud
from app.manager_api.crud import router as crud_router
from app.manager_api import deps
from app.manager_api.models import (
    ManagerClient,
    ManagerClientStatus,
    ManagerDevice,
    ManagerTariff,
    ManagerUser,
    SupportSender,
)
from app.manager_api.schemas import ClientProfile
from app.manager_api.schemas import (
    ClientDetail,
    ClientProfileUpdate,
    ClientSummary,
    ContractConfirmRequest,
    ContractGenerateResponse,
    ContractRead,
    PaymentConfirmRequest,
    BillingNotifyRequest,
    ManagerLoginRequest,
    ManagerTokenResponse,
    ManagerRead,
    PassportRead,
    PassportUpsert,
    DeviceCreate,
    DeviceRead,
    DeviceUpdate,
    DevicePhotoCreate,
    DevicePhotoRead,
    PassportPhotoUploadResponse,
    PassportPhotoUpdate,
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

import boto3

router = APIRouter(prefix="/api/manager", tags=["manager"])
router.include_router(crud_router)

logger = logging.getLogger(__name__)

@router.post("/uploads/presigned", response_model=PresignedUploadResponse)
async def create_generic_upload_url(
    payload: PresignedUploadRequest,
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> PresignedUploadResponse:
    """
    Возвращает пресайнд POST к MinIO/S3.
    Фронт шлёт JSON {"content_type": "image/png"}.
    Файлы складываем под managers/<manager_id>/uploads/...
    """
    prefix = f"managers/{current_manager.id}/uploads"
    presigned = storage_service.generate_presigned_post(
        key_prefix=prefix,
        content_type=payload.content_type,
    )
    return PresignedUploadResponse(
        url=presigned.url,
        fields=presigned.fields,
        file_key=presigned.file_key,
    )


@router.get("/uploads/presigned", response_model=PresignedUploadResponse)
async def create_generic_upload_url_get(
    content_type: str = "image/jpeg",
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> PresignedUploadResponse:
    """GET-вариант (на случай старого фронта)."""
    prefix = f"managers/{current_manager.id}/uploads"
    presigned = storage_service.generate_presigned_post(
        key_prefix=prefix,
        content_type=content_type,
    )
    return PresignedUploadResponse(
        url=presigned.url,
        fields=presigned.fields,
        file_key=presigned.file_key,
    )

# --- Fallback: direct upload via backend (no CORS required) ---

def _make_s3_client():
    endpoint = os.getenv("S3_ENDPOINT", "http://localhost:9000").rstrip("/")
    access_key = os.getenv("S3_ACCESS_KEY", "minioadmin")
    secret_key = os.getenv("S3_SECRET_KEY", "minioadmin")
    # use path-style for MinIO
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="us-east-1",
        config=boto3.session.Config(s3={"addressing_style": "path"}),
    )


def _public_url_for(key: str) -> str | None:
    public = os.getenv("S3_PUBLIC_ENDPOINT") or os.getenv("S3_ENDPOINT")
    if not public:
        return None
    return f"{public.rstrip('/')}/{os.getenv('S3_BUCKET', 'privet-bucket')}/{key.lstrip('/')}"


@router.post("/uploads/direct")
async def direct_upload(
    file: UploadFile = File(...),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
):
    """Accepts a file via form-data and uploads it to MinIO under
    managers/<manager_id>/uploads/<uuid>-<filename>. Returns {file_key}.
    Useful when presigned POST is blocked by CORS in local dev.
    """
    bucket = os.getenv("S3_BUCKET", "privet-bucket")
    # construct key
    safe_name = os.path.basename(file.filename) if file.filename else "upload.bin"
    key = f"managers/{current_manager.id}/uploads/{uuid.uuid4()}-{safe_name}"

    s3 = _make_s3_client()
    body = await file.read()
    content_type = file.content_type or "application/octet-stream"

    try:
        s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType=content_type)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {exc}")

    return {"file_key": key, "url": _public_url_for(key)}

def _full_name(client: ManagerClient) -> str | None:
    if client.passport:
        names = [client.passport.last_name, client.passport.first_name, client.passport.middle_name]
        return " ".join(filter(None, names))
    if client.user and client.user.name:
        return client.user.name
    return None


def _device_to_schema(device: ManagerDevice) -> DeviceRead:
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

# --- Создание устройства клиента ---
@router.post("/clients/{client_id}/devices", response_model=DeviceRead)
async def create_manager_device(
    client_id: uuid.UUID,
    payload: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
):
    """Создание нового устройства клиента и мягкий пересчёт тарифа."""
    client = await _get_client_or_404(db, client_id)
    # как и в других операциях — фиксируем назначение менеджера
    await _ensure_assignment(db, client=client, manager=current_manager)

    # 1) создаём устройство
    created = await crud.create_device(db, client=client, payload=payload)

    # 2) аккуратно пересчитываем тариф (не ломаем создание устройства при ошибке)
    try:
        fresh = await crud.get_client(db, client_id)
        if fresh:
            device_count = len(fresh.devices or [])
            # берём extra_per_device из выбранного тарифа, иначе дефолт 1000
            extra_per_device = (
                float(getattr(getattr(fresh.tariff, "tariff", None), "extra_per_device", 1000) or 1000)
                if fresh.tariff else 1000.0
            )
            total_extra = device_count * extra_per_device
            await crud.update_tariff(
                db,
                client=fresh,
                tariff=(fresh.tariff.tariff if fresh.tariff else None),
                device_count=device_count,
                total_extra_fee=total_extra,
            )
    except Exception as e:
        logger.warning("tariff recalc after device create failed: %s", e)

    return _device_to_schema(created)


@router.post("/clients/{client_id}/devices/{device_id}/photos/upload-url", response_model=PresignedUploadResponse)
async def create_device_photo_upload_url(
    client_id: uuid.UUID,
    device_id: uuid.UUID,
    payload: PresignedUploadRequest,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> PresignedUploadResponse:
    client = await _get_client_or_404(db, client_id)
    await _ensure_assignment(db, client=client, manager=current_manager)

    device = next((d for d in client.devices if str(d.id) == str(device_id)), None)
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
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    await _ensure_assignment(db, client=client, manager=current_manager)

    device = next((d for d in client.devices if str(d.id) == str(device_id)), None)
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
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    await _ensure_assignment(db, client=client, manager=current_manager)

    device = next((d for d in client.devices if str(d.id) == str(device_id)), None)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    photo = next((p for p in device.photos if str(p.id) == str(photo_id)), None)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    await crud.remove_device_photo(db, photo=photo)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)

# --- Удаление устройства клиента ---
@router.delete("/clients/{client_id}/devices/{device_id}", status_code=204)
async def delete_manager_device(
    client_id: uuid.UUID,
    device_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
):
    """Удаление устройства клиента.
    Возвращает 204 при успехе или 404, если устройство не найдено у клиента.
    """
    client = await _get_client_or_404(db, client_id)
    # гарантируем назначение менеджера (как и для остальных действий)
    await _ensure_assignment(db, client=client, manager=current_manager)

    # найдём устройство среди устройств клиента
    device = next((d for d in client.devices if str(d.id) == str(device_id)), None)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    await crud.delete_device(db, device=device)
    return Response(status_code=204)

@router.patch("/clients/{client_id}/devices/{device_id}", response_model=DeviceRead)
async def update_manager_device(
    client_id: uuid.UUID,
    device_id: uuid.UUID,
    payload: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
):
    """Обновление устройства клиента (title/description/specs/extra_fee)."""
    client = await _get_client_or_404(db, client_id)
    # гарантируем назначение менеджера (как и для остальных действий)
    await _ensure_assignment(db, client=client, manager=current_manager)

    # найдём устройство среди устройств клиента
    device = next((d for d in client.devices if str(d.id) == str(device_id)), None)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    updated = await crud.update_device(db, device=device, payload=payload)
    return _device_to_schema(updated)

def _tariff_to_schema(tariff: ManagerTariff | None, client_tariff) -> TariffRead:
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

@router.post("/clients/{client_id}/tariff/apply", response_model=TariffRead)
async def apply_tariff_for_client(
    client_id: uuid.UUID,
    payload: TariffCalculateRequest,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
):
    """
    Зафиксировать рассчитанный тариф в карточке клиента (upsert ManagerClientTariff).
    """
    client = await _get_client_or_404(db, client_id)
    await _ensure_assignment(db, client=client, manager=current_manager)

    tariff = None
    if payload.tariff_id:
        tariff = await crud.get_tariff_by_id(db, payload.tariff_id)

    device_count, extra_per_device, total_extra_fee = await crud.calculate_tariff(
        tariff=tariff,
        request=payload,
    )

    updated = await crud.update_tariff(
        db,
        client=client,
        tariff=tariff,
        device_count=device_count,
        total_extra_fee=total_extra_fee,
    )

    return _tariff_to_schema(tariff, updated)

@router.post("/clients/{client_id}/tariff/calculate", response_model=TariffCalculateResponse)
async def calculate_tariff_post(
    client_id: uuid.UUID,
    payload: TariffCalculateRequest,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
):
    """Расчёт тарифа (POST-вариант для совместимости с фронтом).
    Ничего не изменяет в БД, только возвращает расчёт по текущему/переданному тарифу.
    """
    # Убедимся, что клиент существует и закрепим менеджера
    client = await _get_client_or_404(db, client_id)
    await _ensure_assignment(db, client=client, manager=current_manager)

    # Если пришёл tariff_id — найдём тариф, иначе считаем с дефолтными параметрами
    tariff = None
    if payload.tariff_id:
        tariff = await crud.get_tariff_by_id(db, payload.tariff_id)

    device_count, extra_per_device, total_extra = await crud.calculate_tariff(
        tariff=tariff,
        request=payload,
    )

    return TariffCalculateResponse(
        device_count=device_count,
        extra_per_device=extra_per_device,
        total_extra_fee=total_extra,
    )

async def _get_client_or_404(
    db: AsyncSession,
    client_id: uuid.UUID,
) -> ManagerClient:
    client = await crud.get_client(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


def _passport_to_schema(passport) -> PassportRead | None:
    if not passport:
        return None
    schema = PassportRead.model_validate(passport)
    # If photo_url stores an S3/MinIO key, convert it to a public URL for the UI
    schema.photo_url = (
        storage_service.get_public_url(passport.photo_url)
        if getattr(passport, "photo_url", None)
        else None
    )
    return schema


def _client_to_detail(client: ManagerClient) -> ClientDetail:
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
    invoices_schema = [
        InvoiceRead.model_validate(inv)
        for inv in sorted(client.invoices or [], key=lambda x: x.created_at, reverse=True)
    ]

    return ClientDetail(
        id=client.id,
        status=client.status,
        assigned_manager_id=client.assigned_manager_id,
        support_ticket_id=client.support_ticket_id,
        user=ClientProfile(
            id=client.user.id,
            phone=client.user.phone,
            email=client.user.email,
            name=client.user.name,
            address=client.user.address,
        ),
        passport=_passport_to_schema(client.passport),
        devices=devices,
        tariff=tariff_schema,
        contract=ContractRead.model_validate(client.contract) if client.contract else None,
        invoices=invoices_schema,
    )


async def _ensure_assignment(
    db: AsyncSession,
    *,
    client: ManagerClient,
    manager: ManagerUser,
) -> ManagerClient:
    if client.assigned_manager_id is None:
        client = await crud.assign_manager(db, client=client, manager_id=manager.id)
    return client


@router.post("/auth/login", response_model=ManagerTokenResponse)
async def manager_login(payload: ManagerLoginRequest, db: AsyncSession = Depends(get_db)) -> ManagerTokenResponse:
    manager = await crud.get_manager_by_email(db, payload.email)
    if not manager or not manager.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(payload.password, manager.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token, expires_in = security.create_manager_access_token(
        str(manager.id),
        {"email": manager.email, "is_super_admin": manager.is_super_admin},
    )
    return ManagerTokenResponse(access_token=token, expires_in=expires_in)


@router.get("/auth/me", response_model=ManagerRead)
async def manager_profile(current_manager: ManagerUser = Depends(deps.get_current_manager)) -> ManagerRead:
    return ManagerRead.model_validate(current_manager)


@router.get("/clients", response_model=list[ClientSummary])
async def list_manager_clients(
    query: ClientsQuery = Depends(),
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> list[ClientSummary]:
    if query.tab == "new":
        # Для вкладки «Новые» показываем общий пул: БЕЗ привязки к конкретному менеджеру
        # (crud.list_clients трактует manager_id=None как assigned_manager_id IS NULL)
        clients = await crud.list_clients(db, manager_id=None, tab="new")
    else:
        # Остальные вкладки фильтруются по текущему менеджеру
        clients = await crud.list_clients(db, manager_id=current_manager.id, tab=query.tab)
    summaries: list[ClientSummary] = []
    for client in clients:
        summaries.append(
            ClientSummary(
                id=client.id,
                user_id=client.user_id,
                name=(client.user.name if client.user and client.user.name else None),
                phone=client.user.phone if client.user else "",
                email=client.user.email if client.user else None,
                status=client.status,
                assigned_manager_id=client.assigned_manager_id,
                support_ticket_id=client.support_ticket_id,
                created_at=client.created_at,
                updated_at=client.updated_at,
                devices_count=len(client.devices),
                registration_address=client.user.address if client.user else None,
            )
        )
    return summaries


@router.get("/clients/{client_id}", response_model=ClientDetail)
async def get_manager_client(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.put("/clients/{client_id}/passport", response_model=ClientDetail)
async def upsert_passport_put(
    client_id: uuid.UUID,
    payload: PassportUpsert,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, manager=current_manager)

    # CRUD expects `payload`, not `data`.
    await crud.upsert_passport(db, client=client, payload=payload)

    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.patch("/clients/{client_id}/passport", response_model=ClientDetail)
async def upsert_passport_patch(
    client_id: uuid.UUID,
    payload: PassportUpsert,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, manager=current_manager)

    # Use the same upsert for partial updates; optional fields may be omitted.
    await crud.upsert_passport(db, client=client, payload=payload)

    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.post("/clients/{client_id}/passport/photo/upload-url", response_model=PassportPhotoUploadResponse)
async def create_passport_photo_upload_url(
    client_id: uuid.UUID,
    payload: PresignedUploadRequest,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> PassportPhotoUploadResponse:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, manager=current_manager)

    prefix = f"clients/{client_id}/passport"
    presigned = storage_service.generate_presigned_post(key_prefix=prefix, content_type=payload.content_type)
    return PassportPhotoUploadResponse(url=presigned.url, fields=presigned.fields, file_key=presigned.file_key)


@router.post("/clients/{client_id}/passport/photo", response_model=ClientDetail)
async def attach_passport_photo(
    client_id: uuid.UUID,
    payload: PassportPhotoUpdate,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, manager=current_manager)

    if client.passport is None:
        raise HTTPException(status_code=400, detail="Passport is not filled yet")

    await crud.update_passport_photo(db, client=client, file_key=payload.file_key)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.delete("/clients/{client_id}/passport/photo", response_model=ClientDetail)
async def delete_passport_photo(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, manager=current_manager)

    if not client.passport or not client.passport.photo_url:
        raise HTTPException(status_code=404, detail="Passport photo not found")

    storage_service.delete_object(client.passport.photo_url)
    await crud.update_passport_photo(db, client=client, file_key=None)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)



# --- helpers ---------------------------------------------------------------


def _normalize_value(value: object) -> object:
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_normalize_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _normalize_value(val) for key, val in sorted(value.items(), key=lambda item: str(item[0]))}
    return str(value)


def _canonical_passport(snapshot: dict | None) -> dict:
    if not snapshot:
        return {}
    return {
        "last_name": (snapshot.get("last_name") or ""),
        "first_name": (snapshot.get("first_name") or ""),
        "middle_name": (snapshot.get("middle_name") or ""),
        "series": (snapshot.get("series") or ""),
        "number": (snapshot.get("number") or ""),
        "issued_by": (snapshot.get("issued_by") or ""),
        "issue_code": (snapshot.get("issue_code") or ""),
        "issue_date": (snapshot.get("issue_date") or ""),
        "registration_address": (snapshot.get("registration_address") or ""),
        "phone": (snapshot.get("phone") or ""),
        "email": (snapshot.get("email") or ""),
        "name": (snapshot.get("name") or ""),
        "address": (snapshot.get("address") or ""),
    }


def _canonical_devices(devices: list[dict] | None) -> list[dict]:
    if not devices:
        return []
    canon: list[dict] = []
    for raw in devices:
        photos = raw.get("photos") or []
        canon.append(
            {
                "id": str(raw.get("id") or ""),
                "device_type": raw.get("device_type") or "",
                "title": raw.get("title") or "",
                "description": raw.get("description") or "",
                "specs": _normalize_value(raw.get("specs") or {}),
                "extra_fee": float(raw.get("extra_fee") or 0),
            }
        )
    canon.sort(key=lambda item: item["id"])
    return canon


def _canonical_tariff(snapshot: dict | None) -> dict:
    if not snapshot:
        return {}
    return {
        "tariff_id": str(snapshot.get("tariff_id")) if snapshot.get("tariff_id") else None,
        "device_count": int(snapshot.get("device_count") or 0),
        "total_extra_fee": float(snapshot.get("total_extra_fee") or 0),
        "extra_per_device": float(snapshot.get("extra_per_device") or 0),
        "base_fee": float(snapshot.get("base_fee") or 0),
        "name": snapshot.get("name") or "",
        "client_full_name": snapshot.get("client_full_name") or "",
    }


def _contract_signature(
    *, passport_snapshot: dict | None, device_snapshot: list[dict] | None, tariff_snapshot: dict | None
) -> str:
    canonical_payload = {
        "passport": _normalize_value(_canonical_passport(passport_snapshot)),
        "devices": _normalize_value(_canonical_devices(device_snapshot)),
        "tariff": _normalize_value(_canonical_tariff(tariff_snapshot)),
    }
    return json.dumps(canonical_payload, ensure_ascii=False, sort_keys=True)


def _signature_hash(signature: str) -> str:
    return hashlib.sha1(signature.encode("utf-8")).hexdigest()


def _device_addition_stats(previous: list[dict] | None, current: list[dict] | None) -> tuple[bool, int]:
    if not isinstance(previous, list) or not isinstance(current, list):
        return False, 0
    prev_ids = {str(item.get("id")) for item in previous if isinstance(item, dict) and item.get("id")}
    curr_ids = {str(item.get("id")) for item in current if isinstance(item, dict) and item.get("id")}
    added_ids = curr_ids - prev_ids
    return bool(added_ids), len(added_ids)


@router.post("/clients/{client_id}/contract/generate", response_model=ContractGenerateResponse)
async def generate_contract(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> ContractGenerateResponse:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, manager=current_manager)

    if not client.passport:
        logger.info(
            "CONTRACT generate blocked client_id=%s reason=missing_passport",
            client_id,
        )
        raise HTTPException(status_code=400, detail="Passport data is required before contract generation")
    if client.devices is None:
        logger.info(
            "CONTRACT generate blocked client_id=%s reason=devices_not_loaded",
            client_id,
        )
        raise HTTPException(status_code=400, detail="Devices not loaded for contract generation")
    if not client.tariff:
        logger.info(
            "CONTRACT generate blocked client_id=%s reason=missing_tariff",
            client_id,
        )
        raise HTTPException(status_code=400, detail="Tariff calculation is required before contract generation")

    if client.contract and not client.contract.signed_at and client.contract.contract_number and client.contract.otp_sent_at:
        logger.info(
            "CONTRACT generate reuse (otp_sent) client_id=%s contract_number=%s",
            client_id,
            client.contract.contract_number,
        )
        return ContractGenerateResponse(
            contract_id=client.contract.id,
            otp_code="",
            contract_url=client.contract.contract_url,
            contract_number=client.contract.contract_number,
        )

    device_count = len(client.devices or [])
    extra_per_device = float(
        client.tariff.tariff.extra_per_device if client.tariff and client.tariff.tariff else 1000.0
    )
    total_extra_fee = device_count * extra_per_device
    if (
        client.tariff
        and (
            client.tariff.device_count != device_count
            or float(client.tariff.total_extra_fee or 0) != total_extra_fee
        )
    ):
        client.tariff = await crud.update_tariff(
            db,
            client=client,
            tariff=(client.tariff.tariff if client.tariff else None),
            device_count=device_count,
            total_extra_fee=total_extra_fee,
        )

    passport_snapshot = {
        "last_name": client.passport.last_name or "",
        "first_name": client.passport.first_name or "",
        "middle_name": client.passport.middle_name or "",
        "series": client.passport.series or "",
        "number": client.passport.number or "",
        "issued_by": client.passport.issued_by or "",
        "issue_code": client.passport.issue_code or "",
        "issue_date": (client.passport.issue_date.isoformat() if client.passport and client.passport.issue_date else ""),
        "registration_address": client.passport.registration_address or "",
        "photo_url": client.passport.photo_url or "",
        "phone": client.user.phone if client.user else "",
        "email": client.user.email if client.user and client.user.email else "",
        "name": client.user.name if client.user and client.user.name else "",
        "address": client.user.address if client.user and client.user.address else "",
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
        "device_count": device_count,
        "total_extra_fee": float(total_extra_fee),
        "extra_per_device": float(extra_per_device),
        "base_fee": float(client.tariff.tariff.base_fee) if client.tariff and client.tariff.tariff else 0,
    }
    if client.tariff.tariff:
        tariff_snapshot.update(
            name=client.tariff.tariff.name,
            base_fee=float(client.tariff.tariff.base_fee or 0),
            extra_per_device=float(client.tariff.tariff.extra_per_device or 0),
        )
    client_full_name = client.user.name if (client.user and client.user.name) else ""
    tariff_snapshot["client_full_name"] = client_full_name
    previous_device_snapshot = (
        client.contract.device_snapshot if client.contract and client.contract.signed_at else None
    )
    device_added, device_added_count = _device_addition_stats(
        previous_device_snapshot,
        device_snapshot,
    )
    was_signed_before_regen = bool(client.contract and client.contract.signed_at)
    tariff_snapshot["device_added"] = device_added
    tariff_snapshot["device_added_count"] = device_added_count
    tariff_snapshot["was_signed_before_regen"] = was_signed_before_regen

    current_signature = _contract_signature(
        passport_snapshot=passport_snapshot,
        device_snapshot=device_snapshot,
        tariff_snapshot=tariff_snapshot,
    )
    current_sig_hash = _signature_hash(current_signature)

    if client.contract:
        previous_signature = _contract_signature(
            passport_snapshot=client.contract.passport_snapshot,
            device_snapshot=client.contract.device_snapshot,
            tariff_snapshot=client.contract.tariff_snapshot,
        )
        previous_sig_hash = _signature_hash(previous_signature)
        prev_device_len = len(client.contract.device_snapshot or []) if isinstance(client.contract.device_snapshot, list) else -1
        prev_device_type = type(client.contract.device_snapshot).__name__
        logger.info(
            "CONTRACT signature client_id=%s has_contract=%s signed=%s current=%s previous=%s devices=%s prev_devices=%s prev_devices_type=%s device_added=%s device_added_count=%s total_extra=%s extra_per_device=%s",
            client_id,
            True,
            bool(client.contract.signed_at),
            current_sig_hash,
            previous_sig_hash,
            len(device_snapshot),
            prev_device_len,
            prev_device_type,
            device_added,
            device_added_count,
            float(tariff_snapshot.get("total_extra_fee") or 0),
            float(tariff_snapshot.get("extra_per_device") or 0),
        )
        if current_signature == previous_signature:
            logger.info("CONTRACT generate reuse client_id=%s", client_id)
            # Снимки совпадают — повторно не генерируем, возвращаем существующий договор
            return ContractGenerateResponse(
                contract_id=client.contract.id,
                otp_code="",
                contract_url=client.contract.contract_url,
                contract_number=client.contract.contract_number,
            )
    else:
        logger.info(
            "CONTRACT signature client_id=%s has_contract=%s signed=%s current=%s devices=%s device_added=%s device_added_count=%s total_extra=%s extra_per_device=%s",
            client_id,
            False,
            False,
            current_sig_hash,
            len(device_snapshot),
            device_added,
            device_added_count,
            float(tariff_snapshot.get("total_extra_fee") or 0),
            float(tariff_snapshot.get("extra_per_device") or 0),
        )

    # --- Generate short contract number: AA-YYMMDD-NN ---
    # AA – первые 2 буквы фамилии (или имени), YYMMDD – дата UTC, NN – порядковый за день
    last_name = (
        client.passport.last_name
        if (client.passport and client.passport.last_name)
        else (client.user.name or "")
    ).strip()
    two = re.sub(r"[^A-Za-zА-Яа-яЁё]", "", last_name).upper()[:2] or "XX"
    yymmdd = datetime.utcnow().strftime("%y%m%d")

    # Если у клиента уже есть номер с сегодняшней датой — увеличим суффикс
    seq = 1
    if client.contract and client.contract.contract_number:
        m = re.match(r"^[A-Za-zА-Яа-яЁё]{2}-(\d{6})-(\d{2})$", client.contract.contract_number or "")
        if m and m.group(1) == yymmdd:
            try:
                seq = max(1, int(m.group(2))) + 1
            except Exception:
                seq = 1

    contract_number = f"{two}-{yymmdd}-{seq:02d}"
    pdf_bytes = build_contract_pdf(
        contract_number=contract_number,
        passport_snapshot=passport_snapshot,
        devices=device_snapshot,
        tariff_snapshot=tariff_snapshot,
        client_full_name=client_full_name,
    )

    pdf_key = f"contracts/{client_id}/{contract_number}.pdf"
    storage_service.upload_bytes(key=pdf_key, data=pdf_bytes, content_type="application/pdf")
    contract_url = storage_service.get_public_url(pdf_key)

    # Сохраняем контракт БЕЗ OTP (OTP запрашивается отдельным эндпоинтом /contract/request-otp)
    contract = await crud.upsert_contract(
        db,
        client=client,
        data={
            "tariff_snapshot": tariff_snapshot,
            "passport_snapshot": passport_snapshot,
            "device_snapshot": device_snapshot,
            "contract_number": contract_number,
            "contract_url": contract_url,
            "signed_at": None,
            "payment_confirmed_at": None,
            "otp_code": None,
            "otp_sent_at": None,
        },
    )

    # Никаких сообщений в Support здесь не отправляем
    client = await crud.set_client_status(db, client=client, status=ManagerClientStatus.AWAITING_CONTRACT)
    return ContractGenerateResponse(
        contract_id=contract.id,
        otp_code="",
        contract_url=contract.contract_url,
        contract_number=contract.contract_number,
    )


@router.post("/clients/{client_id}/contract/request-otp", status_code=200)
async def request_contract_otp(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> dict:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, manager=current_manager)

    if not client.contract:
        raise HTTPException(status_code=404, detail="Contract not generated")

    now = datetime.now(timezone.utc)
    if client.contract and client.contract.otp_code and client.contract.otp_sent_at:
        elapsed = (now - client.contract.otp_sent_at).total_seconds()
        if elapsed < 60:
            otp_code = client.contract.otp_code
        else:
            otp_code = f"{secrets.randbelow(9000) + 1000:04d}"
    else:
        otp_code = f"{secrets.randbelow(9000) + 1000:04d}"
    await crud.upsert_contract(
        db,
        client=client,
        data={"otp_code": otp_code, "otp_sent_at": now},
    )
    logger.info(
        "OTP send client_id=%s contract_number=%s otp_len=%s",
        client_id,
        client.contract.contract_number if client.contract else None,
        len(otp_code),
    )

    try:
        thread = await crud.ensure_support_thread(db, client=client, title="Подписание договора")
        _ = thread  # создан и ок
        # Пропускаем запись в локальный чат; OTP ниже отправится через SupportBridge.
    except Exception:
        pass

    support_bridge = SupportBridgeService(db)
    ticket = await support_bridge.ensure_ticket(client, subject="Подписание договора")
    await support_bridge.post_support_message(
        ticket=ticket,
        body=f"Договор {client.contract.contract_number if client.contract and client.contract.contract_number else f'CTR-{client.id.hex[:8].upper()}'}, код подтверждения {otp_code}",
    )

    return {"ok": True}


@router.post("/clients/{client_id}/contract/confirm", response_model=ClientDetail)
async def confirm_contract(
    client_id: uuid.UUID,
    payload: ContractConfirmRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, manager=current_manager)
    if not client.contract:
        raise HTTPException(status_code=404, detail="Contract not generated")

    expected_otp = (client.contract.otp_code or "").strip() if client.contract else ""
    provided_otp = (payload.otp_code or "").strip()
    logger.info(
        "OTP confirm client_id=%s contract_number=%s otp_sent_at=%s expected_len=%s provided_len=%s",
        client_id,
        client.contract.contract_number if client.contract else None,
        client.contract.otp_sent_at if client.contract else None,
        len(expected_otp),
        len(provided_otp),
    )
    if expected_otp != provided_otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    was_signed_before = bool(client.contract and client.contract.signed_at)
    now = datetime.now(timezone.utc)
    ip_addr = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    contract_number = client.contract.contract_number or ""
    pdf_key = f"contracts/{client_id}/{contract_number}.pdf" if contract_number else ""

    signature_hash = None
    signature_hmac = None
    if pdf_key:
        try:
            pdf_bytes = storage_service.get_bytes(key=pdf_key)
        except Exception:
            passport_snapshot = client.contract.passport_snapshot or {}
            device_snapshot = client.contract.device_snapshot or []
            if isinstance(device_snapshot, dict):
                device_snapshot = list(device_snapshot.values())
            tariff_snapshot = client.contract.tariff_snapshot or {}
            pdf_bytes = build_contract_pdf(
                contract_number=contract_number,
                passport_snapshot=passport_snapshot,
                devices=list(device_snapshot) if isinstance(device_snapshot, list) else [],
                tariff_snapshot=tariff_snapshot,
                client_full_name=(client.user.name if client.user else None),
            )
            storage_service.upload_bytes(key=pdf_key, data=pdf_bytes, content_type="application/pdf")

        signature_hash = hashlib.sha256(pdf_bytes).hexdigest()
        signature_hmac = hmac.new(
            settings.CONTRACT_SIGNATURE_SECRET.encode("utf-8"),
            signature_hash.encode("utf-8"),
            digestmod=hashlib.sha256,
        ).hexdigest()

    await crud.upsert_contract(
        db,
        client=client,
        data={
            "signed_at": now,
            "pep_agreed_at": now,
            "otp_code": None,
            "signature_hash": signature_hash,
            "signature_hmac": signature_hmac,
            "signed_ip": ip_addr,
            "signed_user_agent": user_agent,
        },
    )
    client = await _get_client_or_404(db, client_id)
    tariff_snapshot = client.contract.tariff_snapshot if client.contract else {}
    was_signed = bool(was_signed_before or tariff_snapshot.get("was_signed_before_regen"))
    device_added = bool(tariff_snapshot.get("device_added"))
    device_added_count = int(tariff_snapshot.get("device_added_count") or 0)
    if device_added and device_added_count <= 0:
        device_added_count = 1
    amount_to_bill = 0.0
    extra_per_device = float(tariff_snapshot.get("extra_per_device") or 0)
    if extra_per_device <= 0:
        extra_per_device = 1000.0
    if was_signed:
        if device_added:
            amount_to_bill = device_added_count * extra_per_device
    else:
        amount_to_bill = float(tariff_snapshot.get("total_extra_fee") or 0)
    logger.info(
        "BILLING calc client_id=%s was_signed=%s device_added=%s device_added_count=%s amount_to_bill=%s extra_per_device=%s",
        client_id,
        was_signed,
        device_added,
        device_added_count,
        amount_to_bill,
        extra_per_device,
    )
    if device_added and amount_to_bill > 0:
        invoice = await crud.ensure_invoice_for_client(
            db,
            client=client,
            contract_number=client.contract.contract_number or "",
            amount=amount_to_bill,
        )
        try:
            thread = await crud.ensure_support_thread(db, client=client, title="Подписание договора")
            _ = thread
        except Exception:
            pass
        support_bridge = SupportBridgeService(db)
        ticket = await support_bridge.ensure_ticket(client, subject="Подписание договора")
        await support_bridge.post_support_message(
            ticket=ticket,
            body=(
                f"Выставлен счёт по договору {invoice.contract_number}: {float(invoice.amount):.2f} ₽."
                f" Оплатите до {invoice.due_date.strftime('%d.%m.%Y')}"
            ),
        )
        client = await crud.set_client_status(db, client=client, status=ManagerClientStatus.AWAITING_PAYMENT)
    else:
        client = await crud.set_client_status(db, client=client, status=ManagerClientStatus.PROCESSED)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.post("/clients/{client_id}/payment/confirm", response_model=ClientDetail)
async def confirm_payment(
    client_id: uuid.UUID,
    payload: PaymentConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, manager=current_manager)
    if not client.contract:
        raise HTTPException(status_code=404, detail="Contract not generated")

    now = datetime.now(timezone.utc)
    await crud.upsert_contract(db, client=client, data={"payment_confirmed_at": now})
    client = await crud.set_client_status(db, client=client, status=ManagerClientStatus.PROCESSED)
    client = await _get_client_or_404(db, client_id)
    return _client_to_detail(client)


@router.post("/clients/{client_id}/billing/notify", response_model=ClientDetail)
async def notify_billing(
    client_id: uuid.UUID,
    payload: BillingNotifyRequest,
    db: AsyncSession = Depends(get_db),
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> ClientDetail:
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, manager=current_manager)

    await crud.create_invoice(
        db,
        client=client,
        amount=payload.amount,
        description=payload.description,
        contract_number=payload.contract_number,
        due_date=payload.due_date,
    )

    try:
        thread = await crud.ensure_support_thread(db, client=client, title="Подписание договора")
        _ = thread
        # Пропускаем запись в локальный чат (enum sender в БД отличается). Уведомление отправится через SupportBridge ниже.
    except Exception:
        pass

    support_bridge = SupportBridgeService(db)
    ticket = await support_bridge.ensure_ticket(client, subject="Подписание договора")
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
    current_manager: ManagerUser = Depends(deps.get_current_manager),
) -> ClientDetail:
    logger.info(
        "PROFILE PATCH start client_id=%s manager_id=%s payload=%s",
        client_id,
        current_manager.id,
        payload.model_dump(exclude_none=True),
    )
    client = await _get_client_or_404(db, client_id)
    client = await _ensure_assignment(db, client=client, manager=current_manager)

    await crud.update_client_profile(db, client=client, payload=payload)

    if client.status == ManagerClientStatus.NEW:
        client = await crud.set_client_status(db, client=client, status=ManagerClientStatus.IN_VERIFICATION)

    # Always refetch to return fresh values to the UI
    client = await _get_client_or_404(db, client_id)
    logger.info(
        "PROFILE PATCH done client_id=%s manager_id=%s phone=%s email=%s name=%s address=%s",
        client_id,
        current_manager.id,
        client.user.phone,
        client.user.email,
        client.user.name,
        client.user.address,
    )
    return _client_to_detail(client)
