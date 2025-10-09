from datetime import date, datetime
import uuid
from sqlalchemy import DateTime, ForeignKey, String, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base

class Device(Base):
    __tablename__ = "devices"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String)
    brand: Mapped[str] = mapped_column(String)
    model: Mapped[str] = mapped_column(String)
    serial_number: Mapped[str] = mapped_column(String, unique=True)
    purchase_date: Mapped[date] = mapped_column(Date, nullable=True)
    warranty_until: Mapped[date] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    photos = relationship("DevicePhoto", back_populates="device", cascade="all, delete-orphan")

class DevicePhoto(Base):
    __tablename__ = "device_photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    device_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("devices.id"))
    file_url: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    device = relationship("Device", back_populates="photos")
