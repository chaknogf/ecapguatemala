from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, TypeDecorator, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class UUID7(TypeDecorator):
    """UUID version 7 (time-ordered) almacenado como native UUID de PostgreSQL."""

    impl = UUID
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(UUID(as_uuid=True))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            return uuid.UUID(value)
        return value

    def process_result_value(self, value, dialect):
        return value


def _uuid7_py() -> uuid.UUID:
    """UUIDv7 para CPython >= 3.14 con respaldo manual (3.11-3.13)."""
    if hasattr(uuid, "uuid7"):
        return uuid.uuid7()
    rand = int.from_bytes(uuid.uuid4().bytes[:10], "big")
    ms = int(now_utc().timestamp() * 1000) & 0x0FFFFFFFFFFFFFFF
    candidate = (ms << 64) | 0x7000000000000000 | (rand & 0x03FFFFFFFFFFFFFFF)
    return uuid.UUID(int=candidate)


def uuid7() -> uuid.UUID:
    return _uuid7_py()


def now_utc() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
