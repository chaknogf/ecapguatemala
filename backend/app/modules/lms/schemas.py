from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

DeploymentType = Literal["self_hosted", "moodlecloud", "other"]
AccessStrategy = Literal["link_only", "oidc", "lti"]


class LmsSettingsIn(BaseModel):
    deployment_type: DeploymentType = "other"
    base_url: str = Field(min_length=1, max_length=500)
    strategy: AccessStrategy = "link_only"
    sync_enabled: bool = False
    sync_interval_minutes: int = Field(default=15, ge=5, le=1440)
    token: str | None = Field(default=None, max_length=4000)


class LmsTestIn(BaseModel):
    base_url: str | None = Field(default=None, max_length=500)
    token: str | None = Field(default=None, max_length=4000)


class LmsDraftOut(BaseModel):
    deployment_type: str
    base_url: str
    strategy: str
    sync_enabled: bool
    sync_interval_minutes: int
    token_set: bool
    token_hint: str | None = None


class LmsConnectionOut(BaseModel):
    configured: bool
    status: str
    deployment_type: str
    base_url: str | None = None
    token_set: bool
    token_hint: str | None = None
    strategy: str
    sync_enabled: bool
    sync_interval_minutes: int
    site_name: str | None = None
    moodle_release: str | None = None
    moodle_version: str | None = None
    capabilities: dict[str, bool] = Field(default_factory=dict)
    capability_warnings: list[str] = Field(default_factory=list)
    last_checked_at: datetime | None = None
    last_error: str | None = None
    draft: LmsDraftOut | None = None
    updated_at: datetime | None = None


class LmsTestOut(BaseModel):
    ok: bool
    message: str
    site_name: str | None = None
    username: str | None = None
    release: str | None = None
    version: str | None = None
    capabilities: dict[str, bool] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    checked_at: datetime


class LmsActivateOut(BaseModel):
    ok: bool
    message: str
    connection: LmsConnectionOut
