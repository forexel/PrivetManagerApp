"""SQLAlchemy models for the master contour."""

from __future__ import annotations

import uuid
from datetime import datetime, date

from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, String, Text, UniqueConstraint
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.support import SupportTicket


class MasterUser(Base):
    """Credentials for technicians (masters) accessing the portal."""

    __tablename__ = "master_users"
    __table_args__ = (UniqueConstraint("email", name="uq_master_users_email"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    clients: Mapped[list["MasterClient"]] = relationship(back_populates="assigned_master")


class MasterClientStatus(str, PyEnum):
    NEW = "new"
    IN_VERIFICATION = "in_verification"
    AWAITING_CONTRACT = "awaiting_contract"
    AWAITING_PAYMENT = "awaiting_payment"
    PROCESSED = "processed"


class MasterClient(Base):
    __tablename__ = "master_clients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    assigned_master_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("master_users.id", ondelete="SET NULL"), nullable=True
    )
    support_ticket_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("support_tickets.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[MasterClientStatus] = mapped_column(
        Enum(MasterClientStatus, name="master_client_status_t", create_type=False),
        default=MasterClientStatus.NEW,
        nullable=False,
    )

    user = relationship("User")
    assigned_master = relationship("MasterUser", back_populates="clients")
    passport = relationship("MasterPassport", back_populates="client", uselist=False)
    tariff = relationship("MasterClientTariff", back_populates="client", uselist=False)
    devices = relationship("MasterDevice", back_populates="client", cascade="all, delete-orphan")
    contract = relationship("MasterContract", back_populates="client", uselist=False)
    support_thread = relationship("MasterSupportThread", back_populates="client", uselist=False)
    support_ticket = relationship("SupportTicket", foreign_keys=[support_ticket_id])
    invoices = relationship("MasterInvoice", back_populates="client", cascade="all, delete-orphan")


class MasterPassport(Base):
    __tablename__ = "master_passports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("master_clients.id", ondelete="CASCADE"), unique=True)
    last_name: Mapped[str] = mapped_column(String(128), nullable=False)
    first_name: Mapped[str] = mapped_column(String(128), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    series: Mapped[str] = mapped_column(String(16), nullable=False)
    number: Mapped[str] = mapped_column(String(16), nullable=False)
    issued_by: Mapped[str] = mapped_column(String(256), nullable=False)
    issue_code: Mapped[str] = mapped_column(String(16), nullable=False)
    issue_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    registration_address: Mapped[str] = mapped_column(String(512), nullable=False)

    client = relationship("MasterClient", back_populates="passport")


class MasterTariff(Base):
    __tablename__ = "master_tariffs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    base_fee: Mapped[Numeric] = mapped_column(Numeric(10, 2), default=0)
    extra_per_device: Mapped[Numeric] = mapped_column(Numeric(10, 2), default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    client_tariffs = relationship("MasterClientTariff", back_populates="tariff")


class MasterClientTariff(Base):
    __tablename__ = "master_client_tariffs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("master_clients.id", ondelete="CASCADE"), unique=True)
    tariff_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("master_tariffs.id", ondelete="SET NULL"))
    device_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    total_extra_fee: Mapped[Numeric] = mapped_column(Numeric(10, 2), default=0)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    client = relationship("MasterClient", back_populates="tariff")
    tariff = relationship("MasterTariff", back_populates="client_tariffs")


class MasterDevice(Base):
    __tablename__ = "master_devices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("master_clients.id", ondelete="CASCADE"))
    device_type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    specs: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    extra_fee: Mapped[Numeric] = mapped_column(Numeric(10, 2), default=0)

    client = relationship("MasterClient", back_populates="devices")
    photos = relationship("MasterDevicePhoto", back_populates="device", cascade="all, delete-orphan")


class MasterDevicePhoto(Base):
    __tablename__ = "master_device_photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("master_devices.id", ondelete="CASCADE"))
    file_key: Mapped[str] = mapped_column(String(512), nullable=False)

    device = relationship("MasterDevice", back_populates="photos")


class MasterContract(Base):
    __tablename__ = "master_contracts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("master_clients.id", ondelete="CASCADE"), unique=True)
    tariff_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    passport_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    device_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    otp_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    otp_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payment_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    contract_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    contract_number: Mapped[str | None] = mapped_column(String(64), nullable=True)

    client = relationship("MasterClient", back_populates="contract")


class InvoiceStatus(str, PyEnum):
    PENDING = "pending"
    PAID = "paid"
    CANCELED = "canceled"


class MasterInvoice(Base):
    __tablename__ = "master_invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("master_clients.id", ondelete="CASCADE"))
    amount: Mapped[Numeric] = mapped_column(Numeric(10, 2), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    contract_number: Mapped[str] = mapped_column(String(64), nullable=False)
    due_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    status: Mapped[InvoiceStatus] = mapped_column(Enum(InvoiceStatus, name="invoice_status_t", create_type=False), default=InvoiceStatus.PENDING)

    client = relationship("MasterClient", back_populates="invoices")


class SupportSender(str, PyEnum):
    MASTER = "master"
    CLIENT = "client"
    SYSTEM = "system"


class MasterSupportThread(Base):
    __tablename__ = "master_support_threads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("master_clients.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(256), nullable=False)

    messages = relationship("MasterSupportMessage", back_populates="thread", cascade="all, delete-orphan")
    client = relationship("MasterClient", back_populates="support_thread")


class MasterSupportMessage(Base):
    __tablename__ = "master_support_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("master_support_threads.id", ondelete="CASCADE"))
    sender: Mapped[SupportSender] = mapped_column(Enum(SupportSender, name="support_sender_t", create_type=False))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    thread = relationship("MasterSupportThread", back_populates="messages")
