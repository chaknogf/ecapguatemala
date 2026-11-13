from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, PrincipalDep, require_permission
from app.core.errors import NotFoundError
from app.modules.cms import service as svc
from app.modules.cms.schemas import (
    LandingSectionCreate,
    LandingSectionOut,
    LandingSectionUpdate,
    NewsCreate,
    NewsOut,
    NewsUpdate,
    PublicationCreate,
    PublicationOut,
    PublicationUpdate,
)

router = APIRouter(prefix="/api/v1/landing", tags=["landing"])


# Public read endpoints
@router.get("/sections", response_model=list[LandingSectionOut])
def list_sections(session: DbSession, published_only: bool = Query(default=True)):
    return svc.list_sections(session, published_only=published_only)


@router.get("/publications", response_model=list[PublicationOut])
def list_publications(session: DbSession, published_only: bool = Query(default=True)):
    return svc.list_publications(session, published_only=published_only)


@router.get("/news", response_model=list[NewsOut])
def list_news(session: DbSession, published_only: bool = Query(default=True)):
    return svc.list_news(session, published_only=published_only)


# Protected CRUD
@router.post("/sections", response_model=LandingSectionOut, status_code=201)
def create_section(payload: LandingSectionCreate, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("landing.manage"))):
    s = svc.create_section(session, payload, updated_by=principal.user_id)
    return s


@router.patch("/sections/{key}", response_model=LandingSectionOut)
def update_section(key: str, payload: LandingSectionUpdate, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("landing.manage"))):
    s = svc.get_section(session, key)
    return svc.update_section(session, s, payload, updated_by=principal.user_id)


@router.delete("/sections/{key}")
def delete_section(key: str, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("landing.manage"))):
    s = svc.get_section(session, key)
    svc.delete_section(session, s)
    return {"ok": True}


@router.post("/publications", response_model=PublicationOut, status_code=201)
def create_publication(payload: PublicationCreate, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("landing.manage"))):
    return svc.create_publication(session, payload, created_by=principal.user_id)


@router.patch("/publications/{pub_id}", response_model=PublicationOut)
def update_publication(pub_id: uuid.UUID, payload: PublicationUpdate, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("landing.manage"))):
    p = svc.get_publication(session, pub_id)
    return svc.update_publication(session, p, payload)


@router.delete("/publications/{pub_id}")
def delete_publication(pub_id: uuid.UUID, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("landing.manage"))):
    p = svc.get_publication(session, pub_id)
    svc.delete_publication(session, p)
    return {"ok": True}


@router.post("/news", response_model=NewsOut, status_code=201)
def create_news(payload: NewsCreate, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("landing.manage"))):
    return svc.create_news(session, payload, created_by=principal.user_id)


@router.patch("/news/{news_id}", response_model=NewsOut)
def update_news(news_id: uuid.UUID, payload: NewsUpdate, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("landing.manage"))):
    n = svc.get_news(session, news_id)
    return svc.update_news(session, n, payload)


@router.delete("/news/{news_id}")
def delete_news(news_id: uuid.UUID, session: DbSession, principal: PrincipalDep, _=Depends(require_permission("landing.manage"))):
    n = svc.get_news(session, news_id)
    svc.delete_news(session, n)
    return {"ok": True}
