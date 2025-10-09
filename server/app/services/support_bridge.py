"""Helpers to bridge master actions with global support tickets."""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.master_api.models import MasterClient
from app.models.support import SupportTicket, SupportMessage, MessageAuthor, SupportCaseStatus


class SupportBridgeService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def ensure_ticket(self, client: MasterClient) -> SupportTicket:
        if client.support_ticket_id:
            ticket = await self.db.get(SupportTicket, client.support_ticket_id)
            if ticket:
                return ticket

        ticket = await self._find_existing_ticket(client.user_id)
        if ticket is None:
            ticket = await self._create_ticket(client.user_id)

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

    async def _find_existing_ticket(self, user_id: uuid.UUID) -> Optional[SupportTicket]:
        stmt = (
            select(SupportTicket)
            .where(SupportTicket.user_id == user_id)
            .order_by(SupportTicket.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def _create_ticket(self, user_id: uuid.UUID) -> SupportTicket:
        ticket = SupportTicket(user_id=user_id, subject="Оформление договора", status=SupportCaseStatus.open)
        self.db.add(ticket)
        await self.db.commit()
        await self.db.refresh(ticket)
        return ticket
