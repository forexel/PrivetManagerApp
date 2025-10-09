"""Pydantic schemas used by the master contour."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, ConfigDict

from app.master_api.models import MasterClientStatus


class MasterLoginRequest(BaseModel):
    email: EmailStr = Field(..., description="Master's login email")
    password: str = Field(..., min_length=1, description="Plain-text password")


class MasterTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class MasterRead(BaseModel):
    id: uuid.UUID
    email: EmailStr
    name: str | None = None
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

    model_config = ConfigDict(from_attributes=True)


class ClientProfileUpdate(BaseModel):
    phone: str = Field(..., description="Номер телефона клиента в формате +7...")
    email: EmailStr | None = Field(default=None)
    name: str | None = Field(default=None)


class PassportData(BaseModel):
    last_name: str
    first_name: str
    middle_name: str | None = None
    series: str
    number: str
    issued_by: str
    issue_code: str
    issue_date: date
    registration_address: str


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
    title: str | None = None
    description: str | None = None
    specs: dict | None = None
    extra_fee: float | None = None


class DevicePhotoCreate(BaseModel):
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
    full_name: str | None = None
    phone: str
    email: EmailStr | None = None
    status: MasterClientStatus
    assigned_master_id: uuid.UUID | None = None
    support_ticket_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    devices_count: int

    model_config = ConfigDict(from_attributes=True)


class ClientDetail(BaseModel):
    id: uuid.UUID
    status: MasterClientStatus
    assigned_master_id: uuid.UUID | None = None
    support_ticket_id: uuid.UUID | None = None
    user: ClientProfile
    passport: PassportRead | None = None
    devices: list[DeviceRead]
    tariff: TariffRead | None = None
    contract: ContractRead | None = None
    invoices: list[InvoiceRead] = []

    model_config = ConfigDict(from_attributes=True)


class ClientsQuery(BaseModel):
    tab: Literal["new", "processed", "mine"] = "new"
