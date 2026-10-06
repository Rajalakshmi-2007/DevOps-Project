import logging
import secrets
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Smart Campus CMMS"
    # Leave empty in .env to get a random temporary key (everyone is signed out on restart).
    secret_key: str = ""
    access_token_minutes: int = 60 * 12
    database_url: str = "sqlite:///./campus.db"
    upload_dir: str = "uploads"
    max_upload_mb: int = 5
    # The ONLY admin account. Set both in .env / host environment. No built-in default.
    admin_email: str = ""
    admin_password: str = ""
    cors_origins: str = "*"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if not settings.secret_key:
        settings.secret_key = secrets.token_urlsafe(48)
        logging.getLogger("uvicorn.error").warning(
            "SECRET_KEY is not set. Using a temporary random key; set SECRET_KEY in production."
        )
    return settings
