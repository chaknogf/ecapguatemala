from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.config import get_settings
from app.core.deps import DbSession, PrincipalDep
from app.core.security import hash_password, password_policy_error, verify_password
from app.modules.identity import service as svc
from app.modules.identity.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    TokensOut,
    UserOut,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, session: DbSession):
    user, access, refresh = svc.login(session, payload.email, payload.password)
    return LoginResponse(
        tokens=TokensOut(
            access_token=access,
            refresh_token=refresh,
            expires_in=get_settings().access_token_ttl_minutes * 60,
        ),
        user=UserOut(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role_code=user.role_code,
            active=user.active,
        ),
    )


@router.post("/refresh", response_model=TokensOut)
def refresh(payload: RefreshRequest, session: DbSession):
    access, refresh = svc.refresh(session, payload.refresh_token)
    return TokensOut(
        access_token=access,
        refresh_token=refresh,
        expires_in=get_settings().access_token_ttl_minutes * 60,
    )


@router.post("/logout")
def logout(payload: RefreshRequest, session: DbSession):
    svc.logout(session, payload.refresh_token)
    return {"ok": True}


@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, session: DbSession, principal: PrincipalDep):
    from app.modules.identity.models import User

    user = session.get(User, principal.user_id)
    if user is None:
        from app.core.errors import NotFoundError

        raise NotFoundError("Usuario no encontrado")
    if not verify_password(payload.current_password, user.password_hash):
        from app.core.errors import AuthenticationError

        raise AuthenticationError("Contraseña actual incorrecta")
    err = password_policy_error(payload.new_password)
    if err:
        from app.core.errors import ConflictError

        raise ConflictError(err)
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    session.commit()
    return {"ok": True}
