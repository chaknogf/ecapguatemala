from __future__ import annotations

from typing import Any

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.types import TimestampMixin, UUID7, uuid7


class AuditLog(TimestampMixin, Base):
    """Bitácora de auditoría comercial. Append-only: no se actualiza ni elimina por API."""

    __tablename__ = "audit_log"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    company_id: Mapped[object | None] = mapped_column(
        ForeignKey("company.id", ondelete="SET NULL")
    )
    branch_id: Mapped[object | None] = mapped_column(
        ForeignKey("branch.id", ondelete="SET NULL")
    )
    actor_user_id: Mapped[object | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL")
    )
    actor_email: Mapped[str | None] = mapped_column(String(200))
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64))
    document_ref: Mapped[str | None] = mapped_column(String(120))
    result: Mapped[str] = mapped_column(String(20), nullable=False, default="success")
    before: Mapped[dict | None] = mapped_column(JSONB)
    after: Mapped[dict | None] = mapped_column(JSONB)
    source_ip: Mapped[str | None] = mapped_column(String(64))

    __table_args__ = (
        Index("ix_audit_company_time", "company_id", "created_at"),
        Index("ix_audit_entity", "entity_type", "entity_id"),
        Index("ix_audit_actor", "actor_user_id"),
    )


SENSITIVE_KEYS = frozenset(
    {
        "password",
        "password_hash",
        "new_password",
        "old_password",
        "token",
        "refresh_token",
        "access_token",
        "secret",
        "jwt_secret",
        "authorization",
    }
)


def sanitize(values: Any) -> Any:
    """Elimina campos sensibles antes de persistir auditoría (nunca secretos ni tokens)."""
    if isinstance(values, dict):
        return {
            k: ("***" if k.lower() in SENSITIVE_KEYS else sanitize(v))
            for k, v in values.items()
        }
    if isinstance(values, list):
        return [sanitize(v) for v in values]
    return values
