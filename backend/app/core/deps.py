from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Annotated

import jwt as pyjwt
from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_session
from app.core.errors import AuthenticationError, PermissionDeniedError
from app.core.permissions import has_permission
from app.core.security import decode_access_token
from app.modules.identity.models import User

DbSession = Annotated[Session, Depends(get_session)]


@dataclass(slots=True)
class Principal:
    user_id: uuid.UUID
    email: str
    full_name: str
    role_code: str
    permissions: tuple[str, ...] = field(default_factory=tuple)
    active: bool = True

    def require(self, permission: str) -> None:
        if not has_permission(list(self.permissions), permission):
            raise PermissionDeniedError(f"Permiso requerido: {permission}")


def _extract_bearer(request: Request) -> str:
    header = request.headers.get("Authorization") or ""
    if not header.startswith("Bearer "):
        raise AuthenticationError("Token de acceso requerido")
    return header.removeprefix("Bearer ").strip()


def get_principal(request: Request, session: DbSession) -> Principal:
    token = _extract_bearer(request)
    try:
        claims = decode_access_token(token)
    except pyjwt.ExpiredSignatureError:
        raise AuthenticationError("El token de acceso expiró") from None
    except pyjwt.PyJWTError:
        raise AuthenticationError("Token inválido") from None
    if claims.get("typ") != "access":
        raise AuthenticationError("Tipo de token incorrecto")

    user = session.get(User, uuid.UUID(claims["sub"]))
    if user is None or not user.active:
        raise AuthenticationError("Usuario inexistente o inactivo")

    # load role permissions
    from app.modules.identity.service import get_role_permissions

    perms = get_role_permissions(session, user.role_code)
    principal = Principal(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role_code=user.role_code,
        permissions=tuple(perms),
        active=user.active,
    )
    return principal


PrincipalDep = Annotated[Principal, Depends(get_principal)]


def require_permission(permission: str):
    def _dep(principal: PrincipalDep) -> Principal:
        principal.require(permission)
        return principal

    return _dep
