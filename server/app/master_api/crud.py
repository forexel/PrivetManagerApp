"""Database helpers for master contour."""

from __future__ import annotations

import uuid
from decimal import Decimal
from datetime import datetime, date

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.users import User
from app.master_api.models import (
    MasterClient,
    MasterClientStatus,
    MasterClientTariff,
    MasterContract,
    MasterDevice,
    MasterDevicePhoto,
    MasterInvoice,
    MasterPassport,
    MasterTariff,
    MasterUser,
    MasterSupportThread,
    MasterSupportMessage,
    SupportSender,
    InvoiceStatus,
)
from app.master_api.schemas import (
    ClientProfileUpdate,
    DeviceCreate,
    DeviceUpdate,
    PassportUpsert,
    TariffCalculateRequest,
)

# --- Master users ----------------------------------------------------------------


async def get_master_by_email(db: AsyncSession, email: str) -> MasterUser | None:
    result = await db.execute(select(MasterUser).where(MasterUser.email == email.lower()))
    return result.scalar_one_or_none()


async def get_master_by_id(db: AsyncSession, master_id) -> MasterUser | None:
    result = await db.execute(select(MasterUser).where(MasterUser.id == master_id))
    return result.scalar_one_or_none()


async def create_master(
    db: AsyncSession,
    *,
    email: str,
    password_hash: str,
    name: str | None = None,
) -> MasterUser:
    master = MasterUser(email=email.lower(), password_hash=password_hash, name=name)
    db.add(master)
    await db.commit()
    await db.refresh(master)
    return master


# --- Clients ----------------------------------------------------------------------


async def list_clients(
    db: AsyncSession,
    *,
    master_id: uuid.UUID,
    tab: str,
) -> list[MasterClient]:
    stmt = (
        select(MasterClient)
        .options(
            selectinload(MasterClient.user),
            selectinload(MasterClient.passport),
            selectinload(MasterClient.devices),
        )
        .order_by(MasterClient.created_at.desc())
    )

    if tab == "new":
        stmt = stmt.where(MasterClient.status.in_((
            MasterClientStatus.NEW,
            MasterClientStatus.IN_VERIFICATION,
        )))
    elif tab == "processed":
        stmt = stmt.where(MasterClient.status == MasterClientStatus.PROCESSED)
    elif tab == "mine":
        stmt = stmt.where(MasterClient.assigned_master_id == master_id)

    result = await db.execute(stmt)
    return list(result.scalars().unique())


async def get_client(db: AsyncSession, client_id: uuid.UUID) -> MasterClient | None:
    stmt = (
        select(MasterClient)
        .options(
            selectinload(MasterClient.user),
            selectinload(MasterClient.passport),
            selectinload(MasterClient.devices).selectinload(MasterDevice.photos),
            selectinload(MasterClient.tariff).selectinload(MasterClientTariff.tariff),
            selectinload(MasterClient.contract),
            selectinload(MasterClient.support_thread),
            selectinload(MasterClient.invoices),
        )
        .where(MasterClient.id == client_id)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_client_profile(
    db: AsyncSession,
    *,
    client: MasterClient,
    payload: ClientProfileUpdate,
) -> User:
    user = client.user
    user.phone = payload.phone
    user.email = payload.email
    user.name = payload.name
    await db.commit()
    await db.refresh(user)
    return user


async def upsert_passport(
    db: AsyncSession,
    *,
    client: MasterClient,
    payload: PassportUpsert,
) -> MasterPassport:
    passport = client.passport
    if passport is None:
        passport = MasterPassport(client_id=client.id)
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

    await db.commit()
    await db.refresh(passport)
    return passport


async def create_device(
    db: AsyncSession,
    *,
    client: MasterClient,
    payload: DeviceCreate,
) -> MasterDevice:
    device = MasterDevice(
        client_id=client.id,
        device_type=payload.device_type,
        title=payload.title,
        description=payload.description,
        specs=payload.specs,
        extra_fee=Decimal(str(payload.extra_fee)),
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return device


async def update_device(
    db: AsyncSession,
    *,
    device: MasterDevice,
    payload: DeviceUpdate,
) -> MasterDevice:
    if payload.title is not None:
        device.title = payload.title
    if payload.description is not None:
        device.description = payload.description
    if payload.specs is not None:
        device.specs = payload.specs
    if payload.extra_fee is not None:
        device.extra_fee = Decimal(str(payload.extra_fee))

    await db.commit()
    await db.refresh(device)
    return device


async def delete_device(db: AsyncSession, device: MasterDevice) -> None:
    await db.delete(device)
    await db.commit()


async def add_device_photo(
    db: AsyncSession,
    *,
    device: MasterDevice,
    file_key: str,
) -> MasterDevicePhoto:
    photo = MasterDevicePhoto(device_id=device.id, file_key=file_key)
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return photo


async def remove_device_photo(
    db: AsyncSession,
    *,
    photo: MasterDevicePhoto,
) -> None:
    await db.delete(photo)
    await db.commit()


async def update_tariff(
    db: AsyncSession,
    *,
    client: MasterClient,
    tariff: MasterTariff | None,
    device_count: int,
    total_extra_fee: float,
) -> MasterClientTariff:
    ct = client.tariff
    if ct is None:
        ct = MasterClientTariff(client_id=client.id)
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
    tariff: MasterTariff | None,
    request: TariffCalculateRequest,
) -> tuple[int, float, float]:
    extra_per_device = float(tariff.extra_per_device) if tariff else 1000.0
    device_count = max(0, request.device_count)
    total_extra = device_count * extra_per_device
    return device_count, extra_per_device, total_extra


async def get_tariff_by_id(db: AsyncSession, tariff_id: uuid.UUID) -> MasterTariff | None:
    result = await db.execute(select(MasterTariff).where(MasterTariff.id == tariff_id))
    return result.scalar_one_or_none()


async def list_tariffs(db: AsyncSession) -> list[MasterTariff]:
    result = await db.execute(select(MasterTariff).order_by(MasterTariff.created_at))
    return list(result.scalars())


async def ensure_master_client(db: AsyncSession, user_id: uuid.UUID) -> MasterClient:
    result = await db.execute(select(MasterClient).where(MasterClient.user_id == user_id))
    client = result.scalar_one_or_none()
    if client:
        return client

    client = MasterClient(user_id=user_id)
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return client


async def set_client_status(
    db: AsyncSession,
    *,
    client: MasterClient,
    status: MasterClientStatus,
) -> MasterClient:
    client.status = status
    await db.commit()
    await db.refresh(client)
    return client


async def upsert_contract(
    db: AsyncSession,
    *,
    client: MasterClient,
    data: dict,
) -> MasterContract:
    contract = client.contract
    if contract is None:
        contract = MasterContract(client_id=client.id)
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
    if "payment_confirmed_at" in data:
        contract.payment_confirmed_at = data["payment_confirmed_at"]
    if "contract_number" in data:
        contract.contract_number = data["contract_number"]

    await db.commit()
    await db.refresh(contract)
    return contract


async def assign_master(
    db: AsyncSession,
    *,
    client: MasterClient,
    master_id: uuid.UUID,
) -> MasterClient:
    client.assigned_master_id = master_id
    await db.commit()
    await db.refresh(client)
    return client


async def ensure_support_thread(
    db: AsyncSession,
    *,
    client: MasterClient,
    title: str,
) -> MasterSupportThread:
    if client.support_thread:
        return client.support_thread

    thread = MasterSupportThread(client_id=client.id, title=title)
    db.add(thread)
    await db.commit()
    await db.refresh(thread)
    await db.refresh(client)
    return thread


async def add_support_message(
    db: AsyncSession,
    *,
    thread: MasterSupportThread,
    sender: SupportSender,
    content: str,
    payload: dict | None = None,
) -> MasterSupportMessage:
    message = MasterSupportMessage(thread_id=thread.id, sender=sender, content=content, payload=payload)
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


async def create_invoice(
    db: AsyncSession,
    *,
    client: MasterClient,
    amount: float,
    description: str,
    contract_number: str,
    due_date: date,
) -> MasterInvoice:
    invoice = MasterInvoice(
        client_id=client.id,
        amount=Decimal(str(amount)),
        description=description,
        contract_number=contract_number,
        due_date=due_date,
        status=InvoiceStatus.PENDING,
    )
    db.add(invoice)
    await db.commit()
    await db.refresh(invoice)
    await db.refresh(client)
    return invoice
