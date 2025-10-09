from __future__ import annotations

import uuid

from sqlalchemy import Enum as SAEnum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from enum import Enum

from app.models.base import Base


class SupportCaseStatus(str, Enum):
    open = "open"
    pending = "pending"
    closed = "closed"
    rejected = "rejected"


class MessageAuthor(str, Enum):
    user = "user"
    support = "support"


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[SupportCaseStatus] = mapped_column(SAEnum(SupportCaseStatus, name="supportcasestatus"), default=SupportCaseStatus.open, nullable=False)

    messages: Mapped[list["SupportMessage"]] = relationship(
        "SupportMessage", back_populates="ticket", cascade="all, delete-orphan"
    )


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("support_tickets.id", ondelete="CASCADE"), index=True, nullable=False)
    author: Mapped[MessageAuthor] = mapped_column(SAEnum(MessageAuthor, name="messageauthor"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    ticket: Mapped[SupportTicket] = relationship("SupportTicket", back_populates="messages")
