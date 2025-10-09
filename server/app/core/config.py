from pydantic import AnyUrl
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: AnyUrl = "postgresql+psycopg://privet:privet@localhost:5432/privetdb"
    JWT_SECRET: str = "change_me"
    MASTER_JWT_SECRET: str = "change_master"
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minio"
    S3_SECRET_KEY: str = "minio123"
    S3_BUCKET: str = "privet-bucket"
    # Token lifetimes (can be overridden via .env)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    MASTER_ACCESS_TOKEN_EXPIRE_MINUTES: int = 120

    # SMTP settings (optional). If not provided, email sending is disabled.
    SMTP_HOST: str | None = None
    SMTP_PORT: int | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_FROM: str | None = None
    SMTP_FROM_NAME: str | None = "PrivetSuper"
    # Public base URL for links in emails (optional)
    APP_BASE_URL: str | None = None

    # App meta
    APP_VERSION: str | None = None
    APP_CHANNEL: str | None = None  # web | pwa | apk | ipa

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # ignore unknown vars from .env/environment
    )

settings = Settings()
