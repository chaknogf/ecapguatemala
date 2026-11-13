from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class LandingSectionCreate(BaseModel):
    key: str = Field(min_length=2, max_length=60)
    title: str | None = None
    content: str | None = None
    image_url: str | None = None
    sort_order: int = 0
    published: bool = True


class LandingSectionUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    image_url: str | None = None
    sort_order: int | None = None
    published: bool | None = None


class LandingSectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    key: str
    title: str | None
    content: str | None
    image_url: str | None
    sort_order: int
    published: bool
    created_at: datetime
    updated_at: datetime


class PublicationCreate(BaseModel):
    title: str
    description: str | None = None
    cover_image: str | None = None
    url: str | None = None
    published_at: date | None = None
    status: str = "published"
    sort_order: int = 0


class PublicationUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    cover_image: str | None = None
    url: str | None = None
    published_at: date | None = None
    status: str | None = None
    sort_order: int | None = None


class PublicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    description: str | None
    cover_image: str | None
    url: str | None
    published_at: date | None
    status: str
    sort_order: int
    created_at: datetime
    updated_at: datetime


class NewsCreate(BaseModel):
    title: str
    summary: str | None = None
    content: str | None = None
    cover_image: str | None = None
    url: str | None = None
    published_at: date | None = None
    status: str = "published"
    sort_order: int = 0


class NewsUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    content: str | None = None
    cover_image: str | None = None
    url: str | None = None
    published_at: date | None = None
    status: str | None = None
    sort_order: int | None = None


class NewsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    summary: str | None
    content: str | None
    cover_image: str | None
    url: str | None
    published_at: date | None
    status: str
    sort_order: int
    created_at: datetime
    updated_at: datetime
