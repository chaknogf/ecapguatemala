from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.types import TimestampMixin, UUID7, now_utc, uuid7


class Role(TimestampMixin, Base):
    __tablename__ = "role"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    code: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    permission_patterns: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    system_role: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    description: Mapped[str | None] = mapped_column(Text)


class User(TimestampMixin, Base):
    __tablename__ = "user"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    email: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40))
    password_hash: Mapped[str] = mapped_column(String(500), nullable=False)
    role_code: Mapped[str] = mapped_column(
        ForeignKey("role.code", ondelete="RESTRICT"), nullable=False
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    role: Mapped[Role] = relationship(
        "Role", primaryjoin="User.role_code == Role.code", foreign_keys=[role_code], viewonly=True
    )


class RefreshSession(Base):
    __tablename__ = "refresh_session"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    user_id: Mapped[object] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    family_id: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_refresh_user", "user_id"),)


class LoginAttempt(Base):
    __tablename__ = "login_attempt"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    identifier: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )
