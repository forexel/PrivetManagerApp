"""Database helpers for manager contour."""

from __future__ import annotations

import uuid
from uuid import UUID
from decimal import Decimal
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status  # если импорта нет — добавь
from typing import Any, Optional
from app.core.database import get_db

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.users import User
from app.models.devices import Device, DevicePhoto
from app.services.storage import storage_service
from app.manager_api.models import (
    ManagerClient,
    ManagerClientStatus,
    ManagerClientTariff,
    ManagerContract,
    ManagerDevice,
    ManagerDevicePhoto,
    ManagerInvoice,
    ManagerTariff,
    ManagerUser,
    ManagerSupportThread,
    ManagerSupportMessage,
    SupportSender,
    InvoiceStatus,
    UserPassport,
)
from app.manager_api.schemas import (
    ClientProfileUpdate,
    DeviceCreate,
    DeviceUpdate,
    PassportUpsert,
    TariffCalculateRequest,
    ClientDetail,
    ContractConfirmRequest,
)

router = APIRouter()

# --- Manager users ----------------------------------------------------------------


async def get_manager_by_email(db: AsyncSession, email: str) -> ManagerUser | None:
    result = await db.execute(select(ManagerUser).where(ManagerUser.email == email.lower()))
    return result.scalar_one_or_none()


async def get_manager_by_id(db: AsyncSession, manager_id: uuid.UUID) -> ManagerUser | None:
    result = await db.execute(select(ManagerUser).where(ManagerUser.id == manager_id))
    return result.scalar_one_or_none()


async def create_manager(
    db: AsyncSession,
    *,
    email: str,
    password_hash: str,
    name: str | None = None,
) -> ManagerUser:
    manager = ManagerUser(email=email.lower(), password_hash=password_hash, name=name)
    db.add(manager)
    await db.commit()
    await db.refresh(manager)
    return manager


# --- Clients ----------------------------------------------------------------------


async def list_clients(
    db: AsyncSession,
    *,
    manager_id: uuid.UUID | None,
    tab: str,
) -> list[ManagerClient]:
    stmt = (
        select(ManagerClient)
        .options(
            selectinload(ManagerClient.user),
            selectinload(ManagerClient.passport),
            selectinload(ManagerClient.devices),
        )
        .order_by(ManagerClient.created_at.desc())
    )

    if tab == "new":
        stmt = stmt.where(ManagerClient.status == ManagerClientStatus.NEW)
    elif tab == "in_work":
        stmt = stmt.where(ManagerClient.status.in_((
            ManagerClientStatus.IN_VERIFICATION,
            ManagerClientStatus.AWAITING_CONTRACT,
            ManagerClientStatus.AWAITING_PAYMENT,
        )))
    elif tab == "processed":
        stmt = stmt.where(ManagerClient.status == ManagerClientStatus.PROCESSED)
    elif tab == "mine" and manager_id:
        stmt = stmt.where(ManagerClient.assigned_manager_id == manager_id)

    result = await db.execute(stmt)
    return list(result.scalars().unique())


async def get_client(db: AsyncSession, client_id: uuid.UUID) -> ManagerClient | None:
    stmt = (
        select(ManagerClient)
        .options(
            selectinload(ManagerClient.user),
            selectinload(ManagerClient.passport),
            selectinload(ManagerClient.devices).selectinload(ManagerDevice.photos),
            selectinload(ManagerClient.tariff).selectinload(ManagerClientTariff.tariff),
            selectinload(ManagerClient.contract),
            selectinload(ManagerClient.support_thread),
            selectinload(ManagerClient.invoices),
        )
        .where(ManagerClient.id == client_id)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_client_profile(
    db: AsyncSession,
    *,
    client: ManagerClient,
    payload: ClientProfileUpdate,
) -> User:
    # подстрахуемся, что user загружен
    user = client.user
    if not user:
        from app.models.users import User
        result = await db.execute(select(User).where(User.id == client.user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError(f"User not found for client {client.id}")

    # обновляем только непустые поля
    if payload.phone is not None:
        user.phone = payload.phone
    if payload.email is not None:
        user.email = payload.email
    if payload.name is not None:
        user.name = payload.name
    if payload.address is not None:
        user.address = payload.address

    await db.commit()
    await db.refresh(user)
    return user

async def upsert_passport(
    db: AsyncSession,
    *,
    client: ManagerClient,
    payload: PassportUpsert,
) -> UserPassport:
    passport = client.passport
    if passport is None:
        passport = UserPassport(client_id=client.id)
        db.add(passport)

    passport.last_name = payload.last_name
    passport.first_name = payload.first_name
    passport.middle_name = payload.middle_name
    passport.series = payload.series
    passport.number = payload.number
    passport.issued_by = payload.issued_by
    passport.issue_code = payload.issue_code
    passport.issue_date = payload.issue_date
    passport.registration_address = payload.registration_address
    passport.photo_url = payload.photo_url

    await db.commit()
    await db.refresh(passport)
    return passport


async def update_passport_photo(
    db: AsyncSession,
    *,
    client: ManagerClient,
    file_key: str | None,
) -> UserPassport:
    passport = client.passport
    if passport is None:
        passport = UserPassport(client_id=client.id)
        db.add(passport)

    passport.photo_url = file_key
    await db.commit()
    await db.refresh(passport)
    return passport


async def create_device(
    db: AsyncSession,
    *,
    client: ManagerClient,
    payload: DeviceCreate,
) -> ManagerDevice:
    device = ManagerDevice(
        client_id=client.id,
        device_type=payload.device_type,
        title=payload.title,
        description=payload.description,
        specs=payload.specs,
        extra_fee=Decimal(str(payload.extra_fee)),
    )
    db.add(device)
    await db.flush()

    serial_number = f"mgr-{device.id}"
    shared_device = Device(
        user_id=client.user_id,
        title=payload.title,
        brand=payload.device_type or "",
        model=payload.title,
        serial_number=serial_number,
    )
    db.add(shared_device)
    await db.commit()
    await db.refresh(device)
    return device


async def update_device(
    db: AsyncSession,
    *,
    device: ManagerDevice,
    payload: DeviceUpdate,
) -> ManagerDevice:
    if payload.device_type is not None:
        device.device_type = payload.device_type
    if payload.title is not None:
        device.title = payload.title
    if payload.description is not None:
        device.description = payload.description
    if payload.specs is not None:
        device.specs = payload.specs
    if payload.extra_fee is not None:
        device.extra_fee = Decimal(str(payload.extra_fee))

    serial_number = f"mgr-{device.id}"
    shared_device = await db.scalar(select(Device).where(Device.serial_number == serial_number))
    if shared_device:
        if payload.title is not None:
            shared_device.title = payload.title
            shared_device.model = payload.title
        if payload.device_type is not None:
            shared_device.brand = payload.device_type

    await db.commit()
    await db.refresh(device)
    return device


async def delete_device(db: AsyncSession, device: ManagerDevice) -> None:
    serial_number = f"mgr-{device.id}"
    shared_device = await db.scalar(select(Device).where(Device.serial_number == serial_number))
    if shared_device:
        await db.delete(shared_device)
    await db.delete(device)
    await db.commit()


async def add_device_photo(
    db: AsyncSession,
    *,
    device: ManagerDevice,
    file_key: str,
) -> ManagerDevicePhoto:
    photo = ManagerDevicePhoto(device_id=device.id, file_key=file_key)
    db.add(photo)
    await db.flush()

    serial_number = f"mgr-{device.id}"
    shared_device = await db.scalar(select(Device).where(Device.serial_number == serial_number))
    if shared_device:
        file_url = storage_service.generate_presigned_get_url(file_key)
        db.add(DevicePhoto(device_id=shared_device.id, file_url=file_url))
    await db.commit()
    await db.refresh(photo)
    return photo


async def remove_device_photo(
    db: AsyncSession,
    *,
    photo: ManagerDevicePhoto,
) -> None:
    serial_number = f"mgr-{photo.device_id}"
    shared_device = await db.scalar(select(Device).where(Device.serial_number == serial_number))
    if shared_device:
        shared_photo = await db.scalar(
            select(DevicePhoto).where(DevicePhoto.device_id == shared_device.id)
        )
        if shared_photo:
            await db.delete(shared_photo)
    await db.delete(photo)
    await db.commit()


# --- Ensure invoice for client (no duplicates) ---
async def ensure_invoice_for_client(
    db: AsyncSession,
    *,
    client: ManagerClient,
    contract_number: str,
    amount: float,
    due_in_days: int = 3,
    description: str = "Доплата по договору",
) -> ManagerInvoice:
    """Create pending invoice if not exists for given contract_number."""
    from sqlalchemy import select
    from datetime import date, timedelta
    # check existing PENDING invoice for this client + contract
    res = await db.execute(
        select(ManagerInvoice)
        .where(ManagerInvoice.client_id == client.user_id)
        .where(ManagerInvoice.contract_number == contract_number)
        .where(ManagerInvoice.status == InvoiceStatus.PENDING)
    )
    existing = res.scalar_one_or_none()
    if existing:
        return existing

    due_date = date.today() + timedelta(days=due_in_days)
    invoice = ManagerInvoice(
        client_id=client.user_id,
        amount=Decimal(str(amount or 0)),
        description=description,
        contract_number=contract_number,
        due_date=due_date,
        status=InvoiceStatus.PENDING,
    )
    db.add(invoice)
    await db.commit()
    await db.refresh(invoice)
    return invoice



async def update_tariff(
    db: AsyncSession,
    *,
    client: ManagerClient,
    tariff: ManagerTariff | None,
    device_count: int,
    total_extra_fee: float,
) -> ManagerClientTariff:
    ct = client.tariff
    if ct is None:
        ct = ManagerClientTariff(client_id=client.id)
        db.add(ct)

    ct.tariff_id = tariff.id if tariff else None
    ct.device_count = device_count
    ct.total_extra_fee = Decimal(str(total_extra_fee))
    ct.calculated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(ct)
    return ct


async def calculate_tariff(
    *,
    tariff: ManagerTariff | None,
    request: TariffCalculateRequest,
) -> tuple[int, float, float]:
    extra_per_device = float(tariff.extra_per_device) if tariff else 1000.0
    device_count = max(0, request.device_count)
    total_extra = device_count * extra_per_device
    return device_count, extra_per_device, total_extra


async def get_tariff_by_id(db: AsyncSession, tariff_id: uuid.UUID) -> ManagerTariff | None:
    result = await db.execute(select(ManagerTariff).where(ManagerTariff.id == tariff_id))
    return result.scalar_one_or_none()


async def list_tariffs(db: AsyncSession) -> list[ManagerTariff]:
    result = await db.execute(select(ManagerTariff).order_by(ManagerTariff.created_at))
    return list(result.scalars())


async def ensure_manager_client(db: AsyncSession, user_id: uuid.UUID) -> ManagerClient:
    result = await db.execute(select(ManagerClient).where(ManagerClient.user_id == user_id))
    client = result.scalar_one_or_none()
    if client:
        return client

    client = ManagerClient(user_id=user_id)
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return client


async def set_client_status(
    db: AsyncSession,
    *,
    client: ManagerClient,
    status: ManagerClientStatus,
) -> ManagerClient:
    client.status = status
    await db.commit()
    await db.refresh(client)
    return client


async def upsert_contract(
    db: AsyncSession,
    *,
    client: ManagerClient,
    data: dict,
) -> ManagerContract:
    contract = client.contract
    if contract is None:
        contract = ManagerContract(client_id=client.id)
        db.add(contract)

    if "tariff_snapshot" in data:
        contract.tariff_snapshot = data["tariff_snapshot"]
    if "passport_snapshot" in data:
        contract.passport_snapshot = data["passport_snapshot"]
    if "device_snapshot" in data:
        contract.device_snapshot = data["device_snapshot"]
    if "otp_code" in data:
        contract.otp_code = data["otp_code"]
    if "otp_sent_at" in data:
        contract.otp_sent_at = data["otp_sent_at"]
    if "contract_url" in data:
        contract.contract_url = data["contract_url"]
    if "signed_at" in data:
        contract.signed_at = data["signed_at"]
    if "pep_agreed_at" in data:
        contract.pep_agreed_at = data["pep_agreed_at"]
    if "payment_confirmed_at" in data:
        contract.payment_confirmed_at = data["payment_confirmed_at"]
    if "contract_number" in data:
        contract.contract_number = data["contract_number"]
    if "signature_hash" in data:
        contract.signature_hash = data["signature_hash"]
    if "signature_hmac" in data:
        contract.signature_hmac = data["signature_hmac"]
    if "signed_ip" in data:
        contract.signed_ip = data["signed_ip"]
    if "signed_user_agent" in data:
        contract.signed_user_agent = data["signed_user_agent"]

    await db.commit()
    await db.refresh(contract)
    return contract


async def assign_manager(
    db: AsyncSession,
    *,
    client: ManagerClient,
    manager_id: uuid.UUID,
) -> ManagerClient:
    client.assigned_manager_id = manager_id
    await db.commit()
    await db.refresh(client)
    return client


async def ensure_support_thread(
    db: AsyncSession,
    *,
    client: ManagerClient,
    title: str,
) -> ManagerSupportThread:
    if client.support_thread:
        return client.support_thread

    thread = ManagerSupportThread(client_id=client.id, title=title)
    db.add(thread)
    await db.commit()
    await db.refresh(thread)
    await db.refresh(client)
    return thread


async def add_support_message(
    db: AsyncSession,
    *,
    thread: ManagerSupportThread,
    sender: SupportSender,
    content: str,
    payload: dict | None = None,
) -> ManagerSupportMessage:
    message = ManagerSupportMessage(thread_id=thread.id, sender=sender, content=content, payload=payload)
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


async def create_invoice(
    db: AsyncSession,
    *,
    client: ManagerClient,
    amount: float,
    description: str,
    contract_number: str,
    due_date: date,
) -> ManagerInvoice:
    invoice = ManagerInvoice(
        client_id=client.id,
        amount=Decimal(str(amount or 0)),
        description=description,
        contract_number=contract_number,
        due_date=due_date,
        status=InvoiceStatus.PENDING,
    )
    db.add(invoice)
    await db.commit()
    await db.refresh(invoice)
    return invoice

async def ensure_invoice_for_client(
    db: AsyncSession,
    *,
    client: ManagerClient,
    contract_number: str,
    amount: float,
    due_in_days: int = 3,
    description: str | None = None,
) -> ManagerInvoice | None:
    """
    Guarantee there is a PENDING invoice for this client/contract_number.
    If a PENDING invoice already exists — return it; otherwise create new.
    Returns the invoice or None if amount <= 0.
    """
    if (amount or 0) <= 0:
        return None

    # Is there already a PENDING invoice for this contract?
    from sqlalchemy import select
    stmt = (
        select(ManagerInvoice)
        .where(ManagerInvoice.client_id == client.user_id)
        .where(ManagerInvoice.contract_number == contract_number)
        .where(ManagerInvoice.status == InvoiceStatus.PENDING)
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    # Create a new pending invoice
    due_date = date.today() + timedelta(days=due_in_days or 3)
    inv = ManagerInvoice(
        client_id=client.user_id,
        amount=Decimal(str(amount)),
        description=description or f"Оплата по договору {contract_number}",
        contract_number=contract_number,
        due_date=due_date,
        status=InvoiceStatus.PENDING,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return inv
