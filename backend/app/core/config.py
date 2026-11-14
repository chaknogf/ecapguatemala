from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DEV_SECRET = "cambiar-este-secreto-en-produccion"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "ECAP CRM Académico"
    environment: str = "development"
    debug: bool = False

    database_url: str = Field(
        default="postgresql+psycopg://postgres:postgres@localhost:5432/ecap"
    )
    db_pool_size: int = 10
    db_max_overflow: int = 5
    db_pool_timeout: int = 30

    jwt_secret: str = DEFAULT_DEV_SECRET
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 14
    issuer: str = "synvapp"
    audience: str = "synvapp-api"

    password_min_length: int = 10
    login_max_attempts: int = 5
    login_lockout_minutes: int = 15

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:4200"])

    upload_dir: Path = Path("data/uploads")
    max_upload_mb: int = 5
    backup_dir: Path = Path("data/backups")

    bootstrap_admin_email: str | None = None

    # Integración con Moodle. El token del servicio se guarda cifrado en la base
    # de datos; si no se define LMS_SECRET_KEY se deriva de JWT_SECRET.
    lms_secret_key: str | None = None
    lms_http_timeout_seconds: int = 8
    lms_allowed_hosts: list[str] = Field(default_factory=list)

    @field_validator("environment")
    @classmethod
    def _norm_env(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("jwt_secret")
    @classmethod
    def _reject_default_in_production(cls, v: str) -> str:
        return v

    def assert_production_safe(self) -> None:
        if self.environment == "production":
            if self.jwt_secret == DEFAULT_DEV_SECRET or len(self.jwt_secret) < 32:
                raise RuntimeError(
                    "JWT_SECRET inseguro en produccion: genere uno con "
                    "`python -m app.cli secret` y actualice .env"
                )
            if self.debug:
                raise RuntimeError("DEBUG no puede estar habilitado en produccion")


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.assert_production_safe()
    return s
