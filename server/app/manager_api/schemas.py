"""Pydantic schemas used by the manager contour."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Literal, Optional
from sqlalchemy.orm import selectinload

from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator

from app.manager_api.models import ManagerClientStatus


class ManagerLoginRequest(BaseModel):
    email: EmailStr = Field(..., description="Manager's login email")
    password: str = Field(..., min_length=1, description="Plain-text password")


class ManagerTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class ManagerRead(BaseModel):
    id: uuid.UUID
    email: EmailStr
    name: str | None = None
    is_super_admin: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }


class ClientProfile(BaseModel):
    id: uuid.UUID
    phone: str
    email: EmailStr | None = None
    name: str | None = None
    address: str | None = None

    model_config = ConfigDict(from_attributes=True)



class ClientProfileUpdate(BaseModel):
    phone: str | None = None
    email: EmailStr | None = None
    name: str | None = None
    address: str | None = None

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: str | None):
        if v is None or v == "":
            return v
        if not re.fullmatch(r"^\d{10}$", v):
            raise ValueError("phone must be 10 digits")
        return v


class PassportData(BaseModel):
    last_name: str | None = None
    first_name: str | None = None
    middle_name: str | None = None
    series: str | None = None
    number: str | None = None
    issued_by: str | None = None
    issue_code: str | None = None
    issue_date: date | None = None
    registration_address: str | None = None
    photo_url: str | None = None


class PassportRead(PassportData):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PassportUpsert(PassportData):
    pass


class DevicePhotoRead(BaseModel):
    id: uuid.UUID
    file_key: str
    created_at: datetime
    file_url: str

    model_config = ConfigDict(from_attributes=True)


class DeviceRead(BaseModel):
    id: uuid.UUID
    device_type: str
    title: str
    description: str | None = None
    specs: dict | None = None
    extra_fee: float
    created_at: datetime
    updated_at: datetime
    photos: list[DevicePhotoRead] = []

    model_config = ConfigDict(from_attributes=True)


class DeviceCreate(BaseModel):
    device_type: str
    title: str
    description: str | None = None
    specs: dict | None = None
    extra_fee: float = 0


class DeviceUpdate(BaseModel):
    device_type: str | None = None
    title: str | None = None
    description: str | None = None
    specs: dict | None = None
    extra_fee: float | None = None


class DevicePhotoCreate(BaseModel):
    file_key: str


class PassportPhotoUploadResponse(BaseModel):
    url: str
    fields: dict[str, str]
    file_key: str


class PassportPhotoUpdate(BaseModel):
    file_key: str


class PresignedUploadRequest(BaseModel):
    content_type: str | None = Field(default="image/jpeg")


class PresignedUploadResponse(BaseModel):
    url: str
    fields: dict[str, str]
    file_key: str


class TariffRead(BaseModel):
    tariff_id: uuid.UUID | None = None
    name: str | None = None
    base_fee: float | None = None
    extra_per_device: float | None = None
    device_count: int
    total_extra_fee: float
    calculated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TariffCalculateRequest(BaseModel):
    device_count: int
    tariff_id: uuid.UUID | None = None


class TariffCalculateResponse(BaseModel):
    device_count: int
    extra_per_device: float
    total_extra_fee: float


class ContractRead(BaseModel):
    otp_code: str | None = None
    otp_sent_at: datetime | None = None
    signed_at: datetime | None = None
    payment_confirmed_at: datetime | None = None
    contract_url: str | None = None
    contract_number: str | None = None

    # Снапшоты последнего сгенерированного договора — нужны фронту для сравнения
    passport_snapshot: dict | None = None
    device_snapshot: list[dict] | None = None
    tariff_snapshot: dict | None = None

    model_config = ConfigDict(from_attributes=True)


class ContractGenerateResponse(BaseModel):
    contract_id: uuid.UUID
    otp_code: str
    contract_url: str | None = None
    contract_number: str | None = None


class ContractConfirmRequest(BaseModel):
    otp_code: str


class PaymentConfirmRequest(BaseModel):
    amount: float | None = None


class InvoiceRead(BaseModel):
    id: uuid.UUID
    amount: float
    description: str
    contract_number: str
    due_date: date
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BillingNotifyRequest(BaseModel):
    amount: float
    description: str
    contract_number: str
    due_date: date


class ClientSummary(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str | None = None
    phone: str
    email: EmailStr | None = None
    status: ManagerClientStatus
    assigned_manager_id: uuid.UUID | None = None
    support_ticket_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    devices_count: int
    registration_address: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ClientDetail(BaseModel):
    id: uuid.UUID
    status: ManagerClientStatus
    assigned_manager_id: uuid.UUID | None = None
    support_ticket_id: uuid.UUID | None = None
    user: ClientProfile
    passport: PassportRead | None = None
    devices: list[DeviceRead] = []
    tariff: TariffRead | None = None
    contract: ContractRead | None = None
    invoices: list[InvoiceRead] = []

    model_config = ConfigDict(from_attributes=True)


class ClientsQuery(BaseModel):
    tab: Literal["new", "processed", "mine", "in_work"] = "new"
