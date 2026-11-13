from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AuthenticationError, ConflictError, NotFoundError
from app.core.security import (
    create_access_token,
    hash_password,
    hash_opaque_token,
    generate_opaque_token,
    password_policy_error,
    verify_password,
)
from app.modules.identity.models import LoginAttempt, RefreshSession, Role, User

ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin": ["*"],
    "editor": [
        "users.read",
        "landing.*",
        "landing.manage",
        "courses.*",
        "courses.manage",
        "classrooms.*",
        "classrooms.manage",
        "content.*",
        "content.manage",
        "materials.*",
        "materials.manage",
        "assignments.read",
        "assignments.manage",
        "grades.read",
        "announcements.*",
        "reports.read",
    ],
    "teacher": [
        "courses.read",
        "classrooms.read",
        "classrooms.manage",
        "classrooms.own.*",
        "content.*",
        "content.manage",
        "materials.*",
        "materials.manage",
        "students.read",
        "grades.*",
        "grades.manage",
        "assignments.manage",
        "announcements.*",
        "progress.read",
        "reports.read",
    ],
    "student": [
        "courses.read",
        "classrooms.read",
        "content.read",
        "materials.read",
        "grades.read",
        "announcements.read",
        "progress.read",
    ],
}


def seed_roles(session: Session) -> None:
    names = {
        "admin": "Administrador",
        "editor": "Editor",
        "teacher": "Maestro",
        "student": "Estudiante",
    }
    descs = {
        "admin": "Administración general de la plataforma.",
        "editor": "Preparación y organización de la oferta académica.",
        "teacher": "Gestión de aulas y cursos asignados.",
        "student": "Acceso al portal académico.",
    }
    for code, perms in ROLE_PERMISSIONS.items():
        r = session.execute(select(Role).where(Role.code == code)).scalar_one_or_none()
        if r is None:
            r = Role(code=code, name=names[code], permission_patterns=list(perms), system_role=True, description=descs[code])
            session.add(r)
        else:
            r.permission_patterns = list(perms)
            r.name = names[code]
    session.commit()


def get_role_permissions(session: Session, role_code: str) -> list[str]:
    r = session.execute(select(Role).where(Role.code == role_code)).scalar_one_or_none()
    if r is None:
        return ROLE_PERMISSIONS.get(role_code, [])
    return list(r.permission_patterns or [])


def get_user_by_email(session: Session, email: str) -> User | None:
    return session.execute(select(User).where(User.email == email.lower())).scalar_one_or_none()


def get_user(session: Session, user_id: uuid.UUID) -> User | None:
    return session.get(User, user_id)


def list_users(session: Session, search: str | None = None, role: str | None = None, active: bool | None = None) -> list[User]:
    stmt = select(User)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(User.email.ilike(like) | User.full_name.ilike(like))
    if role:
        stmt = stmt.where(User.role_code == role)
    if active is not None:
        stmt = stmt.where(User.active == active)
    return list(session.execute(stmt.order_by(User.full_name)).scalars().all())


def create_user(session: Session, *, email: str, full_name: str, password: str, role_code: str, phone: str | None = None, active: bool = True) -> User:
    if get_user_by_email(session, email):
        raise ConflictError("Ya existe un usuario con ese correo")
    if role_code not in ROLE_PERMISSIONS:
        raise ConflictError("Rol inválido")
    err = password_policy_error(password)
    if err:
        raise ConflictError(err)
    u = User(
        email=email.lower(),
        full_name=full_name,
        phone=phone,
        password_hash=hash_password(password),
        role_code=role_code,
        active=active,
    )
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


def update_user(session: Session, user: User, **fields) -> User:
    if "email" in fields and fields["email"] is not None:
        new_email = fields["email"].lower()
        if new_email != user.email and get_user_by_email(session, new_email):
            raise ConflictError("Ya existe un usuario con ese correo")
        user.email = new_email
    if "full_name" in fields and fields["full_name"] is not None:
        user.full_name = fields["full_name"]
    if "phone" in fields:
        user.phone = fields["phone"]
    if "role_code" in fields and fields["role_code"] is not None:
        if fields["role_code"] not in ROLE_PERMISSIONS:
            raise ConflictError("Rol inválido")
        user.role_code = fields["role_code"]
    if "active" in fields and fields["active"] is not None:
        user.active = fields["active"]
    if "password" in fields and fields["password"]:
        err = password_policy_error(fields["password"])
        if err:
            raise ConflictError(err)
        user.password_hash = hash_password(fields["password"])
    if "must_change_password" in fields and fields["must_change_password"] is not None:
        user.must_change_password = fields["must_change_password"]
    session.commit()
    session.refresh(user)
    return user


def delete_user(session: Session, user: User) -> None:
    session.delete(user)
    session.commit()


def _check_lockout(session: Session, identifier: str) -> None:
    la = session.execute(select(LoginAttempt).where(LoginAttempt.identifier == identifier)).scalar_one_or_none()
    if la and la.locked_until and la.locked_until > datetime.now(UTC):
        raise AuthenticationError("Cuenta bloqueada temporalmente por intentos fallidos")


def _record_failure(session: Session, identifier: str) -> None:
    settings = get_settings()
    la = session.execute(select(LoginAttempt).where(LoginAttempt.identifier == identifier)).scalar_one_or_none()
    if la is None:
        la = LoginAttempt(identifier=identifier, failures=1)
        session.add(la)
    else:
        la.failures += 1
    if la.failures >= settings.login_max_attempts:
        la.locked_until = datetime.now(UTC) + timedelta(minutes=settings.login_lockout_minutes)
    session.commit()


def _clear_failures(session: Session, identifier: str) -> None:
    la = session.execute(select(LoginAttempt).where(LoginAttempt.identifier == identifier)).scalar_one_or_none()
    if la:
        la.failures = 0
        la.locked_until = None
        session.commit()


def login(session: Session, email: str, password: str) -> tuple[User, str, str]:
    identifier = email.lower()
    _check_lockout(session, identifier)
    user = get_user_by_email(session, identifier)
    if user is None or not user.active or not verify_password(password, user.password_hash):
        _record_failure(session, identifier)
        raise AuthenticationError("Credenciales inválidas")
    _clear_failures(session, identifier)
    user.last_login_at = datetime.now(UTC)
    session.commit()

    perms = get_role_permissions(session, user.role_code)
    access = create_access_token(subject=str(user.id), company_id=None, permissions=tuple(perms))
    refresh_raw = generate_opaque_token()
    rs = RefreshSession(
        user_id=user.id,
        token_hash=hash_opaque_token(refresh_raw),
        family_id=generate_opaque_token(16),
        expires_at=datetime.now(UTC) + timedelta(days=get_settings().refresh_token_ttl_days),
    )
    session.add(rs)
    session.commit()
    return user, access, refresh_raw


def refresh(session: Session, refresh_token: str) -> tuple[str, str]:
    th = hash_opaque_token(refresh_token)
    rs = session.execute(select(RefreshSession).where(RefreshSession.token_hash == th)).scalar_one_or_none()
    if rs is None or rs.revoked_at is not None or rs.expires_at < datetime.now(UTC):
        raise AuthenticationError("Refresh token inválido")
    rs.revoked_at = datetime.now(UTC)
    user = session.get(User, rs.user_id)
    if user is None or not user.active:
        raise AuthenticationError("Usuario inactivo")
    perms = get_role_permissions(session, user.role_code)
    new_access = create_access_token(subject=str(user.id), company_id=None, permissions=tuple(perms))
    new_refresh = generate_opaque_token()
    new_rs = RefreshSession(
        user_id=user.id,
        token_hash=hash_opaque_token(new_refresh),
        family_id=rs.family_id,
        expires_at=datetime.now(UTC) + timedelta(days=get_settings().refresh_token_ttl_days),
    )
    session.add(new_rs)
    session.commit()
    return new_access, new_refresh


def logout(session: Session, refresh_token: str | None) -> None:
    if not refresh_token:
        return
    th = hash_opaque_token(refresh_token)
    rs = session.execute(select(RefreshSession).where(RefreshSession.token_hash == th)).scalar_one_or_none()
    if rs:
        rs.revoked_at = datetime.now(UTC)
        session.commit()
