from __future__ import annotations

from datetime import datetime, date

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.types import TimestampMixin, UUID7, now_utc, uuid7


class LandingSection(TimestampMixin, Base):
    __tablename__ = "landing_section"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    key: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    title: Mapped[str | None] = mapped_column(String(200))
    content: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_by: Mapped[object | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))

    __table_args__ = (Index("ix_ls_key", "key"),)


class Publication(TimestampMixin, Base):
    __tablename__ = "publication"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    cover_image: Mapped[str | None] = mapped_column(String(500))
    url: Mapped[str | None] = mapped_column(String(500))
    published_at: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="published")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[object | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))

    __table_args__ = (Index("ix_pub_status", "status"),)


class NewsItem(TimestampMixin, Base):
    __tablename__ = "news_item"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str | None] = mapped_column(Text)
    cover_image: Mapped[str | None] = mapped_column(String(500))
    url: Mapped[str | None] = mapped_column(String(500))
    published_at: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="published")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[object | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))

    __table_args__ = (Index("ix_news_status", "status"),)
