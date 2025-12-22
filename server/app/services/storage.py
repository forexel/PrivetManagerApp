"""S3-compatible storage helpers (MinIO)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Optional

import boto3
from botocore.client import BaseClient, Config

from app.core.config import settings
import os

# ---- S3/MinIO config from env with sane defaults ----
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://localhost:9000")
S3_PUBLIC_ENDPOINT = os.getenv("S3_PUBLIC_ENDPOINT", S3_ENDPOINT)  # fallback to internal endpoint
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "minioadmin")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "minioadmin")
S3_BUCKET = os.getenv("S3_BUCKET", "privet-bucket")

@dataclass
class PresignedPost:
    url: str
    fields: dict[str, str]
    file_key: str


class StorageService:
    def __init__(self) -> None:
        self._bucket = settings.S3_BUCKET
        self._client: Optional[BaseClient] = None
        self._public_client: Optional[BaseClient] = None

    def _client_or_init(self) -> BaseClient:
        if self._client is None:
            self._client = boto3.client(
                "s3",
                endpoint_url=settings.S3_ENDPOINT,
                aws_access_key_id=settings.S3_ACCESS_KEY,
                aws_secret_access_key=settings.S3_SECRET_KEY,
                config=Config(signature_version="s3v4"),
            )
        return self._client

    def _public_client_or_init(self) -> BaseClient:
        if self._public_client is None:
            public_endpoint = os.getenv("S3_PUBLIC_ENDPOINT") or getattr(settings, "S3_PUBLIC_ENDPOINT", None) or settings.S3_ENDPOINT
            self._public_client = boto3.client(
                "s3",
                endpoint_url=public_endpoint,
                aws_access_key_id=settings.S3_ACCESS_KEY,
                aws_secret_access_key=settings.S3_SECRET_KEY,
                config=Config(signature_version="s3v4"),
            )
        return self._public_client

    @property
    def bucket(self) -> str:
        return self._bucket
    

    def generate_presigned_post(self, *, key_prefix: str, content_type: str | None = None, expires: int = 600) -> PresignedPost:
        file_key = f"{key_prefix.rstrip('/')}/{uuid.uuid4()}"
        conditions = []
        if content_type:
            conditions.append({"Content-Type": content_type})

        presigned = self._client_or_init().generate_presigned_post(
            Bucket=self._bucket,
            Key=file_key,
            Fields={"Content-Type": content_type} if content_type else None,
            Conditions=conditions or None,
            ExpiresIn=expires,
        )
        return PresignedPost(url=presigned["url"], fields=presigned["fields"], file_key=file_key)

    def upload_bytes(self, *, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        self._client_or_init().put_object(Bucket=self._bucket, Key=key, Body=data, ContentType=content_type)
        return key

    def get_bytes(self, *, key: str) -> bytes:
        resp = self._client_or_init().get_object(Bucket=self._bucket, Key=key)
        return resp["Body"].read()

    def get_public_url(self, key: str) -> str:
        """Return a public URL to an object.

        Prefers S3_PUBLIC_ENDPOINT if it is set (useful when MinIO is behind
        ngrok/Nginx), otherwise falls back to internal S3_ENDPOINT.
        """
        public_endpoint = os.getenv("S3_PUBLIC_ENDPOINT") or getattr(settings, "S3_PUBLIC_ENDPOINT", None) or settings.S3_ENDPOINT
        return f"{public_endpoint.rstrip('/')}/{self._bucket}/{key.lstrip('/')}"

    def generate_presigned_get_url(self, key: str, expires: int = 60 * 60 * 24 * 7) -> str:
        """Return a time-limited URL for private objects."""
        return self._public_client_or_init().generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires,
        )

    def delete_object(self, key: str) -> None:
        self._client_or_init().delete_object(Bucket=self._bucket, Key=key)


storage_service = StorageService()
