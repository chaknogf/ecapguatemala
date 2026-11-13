from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, PrincipalDep, require_permission
from app.core.errors import NotFoundError
from app.modules.identity import service as svc
from app.modules.identity.schemas import UserAdminOut, UserCreate, UserUpdate

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("", response_model=list[UserAdminOut])
def list_users(
    session: DbSession,
    principal: PrincipalDep,
    search: str | None = Query(default=None),
    role: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    _=Depends(require_permission("users.read")),
):
    users = svc.list_users(session, search=search, role=role, active=active)
    out = []
    for u in users:
        out.append(
            UserAdminOut(
                id=u.id,
                email=u.email,
                full_name=u.full_name,
                phone=u.phone,
                role_code=u.role_code,
                active=u.active,
                must_change_password=u.must_change_password,
                last_login_at=u.last_login_at,
                created_at=u.created_at,
                updated_at=u.updated_at,
            )
        )
    return out


@router.post("", response_model=UserAdminOut, status_code=201)
def create_user(payload: UserCreate, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("users.manage"))):
    # admin permission check: only admin can manage users; map users.manage -> admin only via role
    u = svc.create_user(
        session,
        email=payload.email,
        full_name=payload.full_name,
        password=payload.password,
        role_code=payload.role_code,
        phone=payload.phone,
        active=payload.active,
    )
    return UserAdminOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        phone=u.phone,
        role_code=u.role_code,
        active=u.active,
        must_change_password=u.must_change_password,
        last_login_at=u.last_login_at,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


@router.get("/{user_id}", response_model=UserAdminOut)
def get_user(user_id: uuid.UUID, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("users.read"))):
    u = svc.get_user(session, user_id)
    if u is None:
        raise NotFoundError("Usuario no encontrado")
    return UserAdminOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        phone=u.phone,
        role_code=u.role_code,
        active=u.active,
        must_change_password=u.must_change_password,
        last_login_at=u.last_login_at,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


@router.patch("/{user_id}", response_model=UserAdminOut)
def update_user(user_id: uuid.UUID, payload: UserUpdate, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("users.manage"))):
    u = svc.get_user(session, user_id)
    if u is None:
        raise NotFoundError("Usuario no encontrado")
    svc.update_user(
        session,
        u,
        full_name=payload.full_name,
        phone=payload.phone,
        role_code=payload.role_code,
        active=payload.active,
        password=payload.password,
        must_change_password=payload.must_change_password,
    )
    return UserAdminOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        phone=u.phone,
        role_code=u.role_code,
        active=u.active,
        must_change_password=u.must_change_password,
        last_login_at=u.last_login_at,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


@router.delete("/{user_id}")
def delete_user(user_id: uuid.UUID, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("users.manage"))):
    u = svc.get_user(session, user_id)
    if u is None:
        raise NotFoundError("Usuario no encontrado")
    svc.delete_user(session, u)
    return {"ok": True}


@router.get("/roles/list", response_model=list[dict])
def list_roles(session: DbSession, principal: PrincipalDep):
    from app.modules.identity.models import Role

    roles = list(session.execute(__import__("sqlalchemy").select(Role)).scalars().all())
    return [{"code": r.code, "name": r.name, "permission_patterns": r.permission_patterns, "description": r.description} for r in roles]
