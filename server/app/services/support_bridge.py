"""Helpers to bridge manager actions with global support tickets."""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.manager_api.models import ManagerClient
from app.models.support import SupportTicket, SupportMessage, MessageAuthor, SupportCaseStatus


class SupportBridgeService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def ensure_ticket(
        self,
        client: ManagerClient,
        *,
        subject: str | None = None,
        force_new: bool = False,
    ) -> SupportTicket:
        if client.support_ticket_id and not force_new:
            ticket = await self.db.get(SupportTicket, client.support_ticket_id)
            if ticket and (subject is None or ticket.subject == subject):
                return ticket

        ticket = None
        if not force_new:
            if subject:
                ticket = await self._find_existing_ticket_by_subject(client.user_id, subject)
            if ticket is None:
                ticket = await self._find_existing_ticket(client.user_id)

        if ticket is None or (subject and ticket.subject != subject):
            ticket = await self._create_ticket(client.user_id, subject=subject)

        if client.support_ticket_id != ticket.id:
            client.support_ticket_id = ticket.id
            await self.db.commit()
            await self.db.refresh(client)

        return ticket

    async def post_support_message(self, *, ticket: SupportTicket, body: str) -> SupportMessage:
        message = SupportMessage(ticket_id=ticket.id, author=MessageAuthor.support, body=body)
        self.db.add(message)
        await self.db.commit()
        await self.db.refresh(message)
        return message

    async def _find_existing_ticket_by_subject(self, user_id: uuid.UUID, subject: str) -> Optional[SupportTicket]:
        stmt = (
            select(SupportTicket)
            .where(SupportTicket.user_id == user_id, SupportTicket.subject == subject)
            .order_by(SupportTicket.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def _find_existing_ticket(self, user_id: uuid.UUID) -> Optional[SupportTicket]:
        stmt = (
            select(SupportTicket)
            .where(SupportTicket.user_id == user_id)
            .order_by(SupportTicket.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def _create_ticket(self, user_id: uuid.UUID, *, subject: str | None = None) -> SupportTicket:
        ticket = SupportTicket(
            user_id=user_id,
            subject=subject or "Оформление договора",
            status=SupportCaseStatus.open,
        )
        self.db.add(ticket)
        await self.db.commit()
        await self.db.refresh(ticket)
        return ticket
