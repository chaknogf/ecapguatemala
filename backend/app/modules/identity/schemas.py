from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _check_email(value: str) -> str:
    if not _EMAIL_RE.match(value or ""):
        raise ValueError("Correo inválido")
    return value.lower()


class LoginRequest(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(min_length=1, max_length=200)

    _validate_email = field_validator("email")(_check_email)


class TokensOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role_code: str
    active: bool


class LoginResponse(BaseModel):
    tokens: TokensOut
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=10, max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class UserCreate(BaseModel):
    email: str = Field(max_length=200)
    full_name: str = Field(min_length=2, max_length=200)
    password: str = Field(min_length=8, max_length=200)
    role_code: str = Field(pattern=r"^(admin|editor|teacher|student)$")
    phone: str | None = None
    active: bool = True

    _validate_email = field_validator("email")(_check_email)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    phone: str | None = None
    role_code: str | None = Field(default=None, pattern=r"^(admin|editor|teacher|student)$")
    active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=200)
    must_change_password: bool | None = None


class UserAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    role_code: str
    active: bool
    must_change_password: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime


class RoleOut(BaseModel):
    code: str
    name: str
    permission_patterns: list[str]
    description: str | None = None
