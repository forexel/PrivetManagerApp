"""S3-compatible storage helpers (MinIO)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

import boto3
from botocore.client import Config

from app.core.config import settings


@dataclass
class PresignedPost:
    url: str
    fields: dict[str, str]
    file_key: str


class StorageService:
    def __init__(self) -> None:
        self._bucket = settings.S3_BUCKET
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            config=Config(signature_version="s3v4"),
        )

    @property
    def bucket(self) -> str:
        return self._bucket

    def generate_presigned_post(self, *, key_prefix: str, content_type: str | None = None, expires: int = 600) -> PresignedPost:
        file_key = f"{key_prefix.rstrip('/')}/{uuid.uuid4()}"
        conditions = []
        if content_type:
            conditions.append({"Content-Type": content_type})

        presigned = self._client.generate_presigned_post(
            Bucket=self._bucket,
            Key=file_key,
            Fields={"Content-Type": content_type} if content_type else None,
            Conditions=conditions or None,
            ExpiresIn=expires,
        )
        return PresignedPost(url=presigned["url"], fields=presigned["fields"], file_key=file_key)

    def upload_bytes(self, *, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        self._client.put_object(Bucket=self._bucket, Key=key, Body=data, ContentType=content_type)
        return key

    def get_public_url(self, key: str) -> str:
        return f"{settings.S3_ENDPOINT.rstrip('/')}/{self._bucket}/{key}"

    def delete_object(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)


storage_service = StorageService()
