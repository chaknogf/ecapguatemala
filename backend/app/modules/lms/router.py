from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.deps import DbSession, PrincipalDep, require_permission
from app.modules.lms import service as svc
from app.modules.lms.schemas import (
    LmsActivateOut,
    LmsConnectionOut,
    LmsSettingsIn,
    LmsTestIn,
    LmsTestOut,
)

router = APIRouter(
    prefix="/api/v1/lms",
    tags=["lms"],
    dependencies=[Depends(require_permission("lms.manage"))],
)


@router.get("/settings", response_model=LmsConnectionOut)
def get_settings(session: DbSession):
    return svc.get_settings_out(session)


@router.put("/settings", response_model=LmsConnectionOut)
def save_settings(payload: LmsSettingsIn, session: DbSession, principal: PrincipalDep):
    return svc.save_settings(session, payload, principal.user_id)


@router.post("/test", response_model=LmsTestOut)
def test_connection(payload: LmsTestIn, session: DbSession):
    return svc.test_connection(session, payload)


@router.post("/activate", response_model=LmsActivateOut)
def activate(session: DbSession, principal: PrincipalDep):
    ok, message, connection = svc.activate(session, principal.user_id)
    return LmsActivateOut(ok=ok, message=message, connection=connection)


@router.post("/disconnect", response_model=LmsConnectionOut)
def disconnect(session: DbSession, principal: PrincipalDep):
    return svc.disconnect(session, principal.user_id)
