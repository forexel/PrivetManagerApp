from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.database import async_session_maker
from app.manager_api.models import ManagerDevicePhoto, ManagerDevice, ManagerClient
from app.models.devices import Device, DevicePhoto
from app.services.storage import storage_service


async def backfill() -> None:
    async with async_session_maker() as session:
        stmt = (
            select(ManagerDevicePhoto, ManagerDevice, ManagerClient)
            .join(ManagerDevice, ManagerDevicePhoto.device_id == ManagerDevice.id)
            .join(ManagerClient, ManagerDevice.client_id == ManagerClient.id)
        )
        res = await session.execute(stmt)
        rows = res.all()

        created = 0
        updated = 0
        skipped = 0

        for photo, device, client in rows:
            serial_number = f"mgr-{device.id}"
            shared_device = await session.scalar(
                select(Device).where(Device.serial_number == serial_number)
            )
            if not shared_device:
                skipped += 1
                continue

            existing = await session.scalar(
                select(DevicePhoto).where(
                    DevicePhoto.device_id == shared_device.id,
                    DevicePhoto.file_url.ilike(f"%{photo.file_key}%"),
                )
            )
            file_url = storage_service.generate_presigned_get_url(photo.file_key)

            if existing:
                if "X-Amz-" not in (existing.file_url or ""):
                    existing.file_url = file_url
                    updated += 1
                else:
                    skipped += 1
                continue

            session.add(DevicePhoto(device_id=shared_device.id, file_url=file_url))
            created += 1

        await session.commit()
        print(f"backfill_device_photos: created={created} updated={updated} skipped={skipped}")


if __name__ == "__main__":
    asyncio.run(backfill())
