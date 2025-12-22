import asyncio
import os

from sqlalchemy import func, select

from app.core.database import async_session_maker
from app.manager_api.models import ManagerClient, ManagerClientStatus
from app.models.users import User


async def main() -> None:
    print(f"DATABASE_URL: {os.getenv('DATABASE_URL')}")
    async with async_session_maker() as session:
        users_count = await session.scalar(select(func.count()).select_from(User))
        existing_count = await session.scalar(select(func.count()).select_from(ManagerClient))
        print(f"users: {users_count}, manager_clients: {existing_count}")

        result = await session.execute(
            select(User.id)
            .outerjoin(ManagerClient, ManagerClient.user_id == User.id)
            .where(ManagerClient.id.is_(None))
        )
        missing_ids = [row[0] for row in result.fetchall()]
        if not missing_ids:
            print("manager_clients already in sync.")
            return

        for user_id in missing_ids:
            session.add(ManagerClient(user_id=user_id, status=ManagerClientStatus.NEW))

        await session.commit()
        print(f"Created manager_clients: {len(missing_ids)}")


if __name__ == "__main__":
    asyncio.run(main())
