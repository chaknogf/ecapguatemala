from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.types import TimestampMixin, UUID7, uuid7

SINGLETON_KEY = "default"


class LmsConnection(TimestampMixin, Base):
    """Configuración de la integración con Moodle.

    Solo existe una fila por instalación (`singleton_key`). Los cambios se
    guardan primero en `draft` y solo se promueven a los campos activos cuando
    el administrador prueba la conexión y activa la configuración.
    """

    __tablename__ = "lms_connection"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    singleton_key: Mapped[str] = mapped_column(String(20), nullable=False, default=SINGLETON_KEY)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unconfigured")

    deployment_type: Mapped[str] = mapped_column(String(20), nullable=False, default="other")
    base_url: Mapped[str | None] = mapped_column(String(500))
    token_encrypted: Mapped[str | None] = mapped_column(Text)
    token_hint: Mapped[str | None] = mapped_column(String(12))
    strategy: Mapped[str] = mapped_column(String(20), nullable=False, default="link_only")
    sync_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sync_interval_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15)

    site_name: Mapped[str | None] = mapped_column(String(200))
    moodle_release: Mapped[str | None] = mapped_column(String(40))
    moodle_version: Mapped[str | None] = mapped_column(String(40))
    capabilities: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)

    draft: Mapped[dict | None] = mapped_column(JSONB)
    updated_by: Mapped[object | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))

    __table_args__ = (
        UniqueConstraint("singleton_key", name="uq_lms_connection_singleton"),
    )
