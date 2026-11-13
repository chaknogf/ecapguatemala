from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.modules.cms.models import LandingSection, NewsItem, Publication


# Sections
def list_sections(session: Session, published_only: bool = False):
    stmt = select(LandingSection)
    if published_only:
        stmt = stmt.where(LandingSection.published == True)
    return list(session.execute(stmt.order_by(LandingSection.sort_order, LandingSection.key)).scalars().all())


def get_section(session: Session, key: str):
    s = session.execute(select(LandingSection).where(LandingSection.key == key)).scalar_one_or_none()
    if s is None:
        raise NotFoundError("Sección no encontrada")
    return s


def create_section(session: Session, data, updated_by=None):
    existing = session.execute(select(LandingSection).where(LandingSection.key == data.key)).scalar_one_or_none()
    if existing:
        # update instead
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(existing, k, v)
        existing.updated_by = updated_by
        session.commit()
        session.refresh(existing)
        return existing
    s = LandingSection(**data.model_dump(), updated_by=updated_by)
    session.add(s)
    session.commit()
    session.refresh(s)
    return s


def update_section(session: Session, section, data, updated_by=None):
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(section, k, v)
    section.updated_by = updated_by
    session.commit()
    session.refresh(section)
    return section


def delete_section(session: Session, section):
    session.delete(section)
    session.commit()


# Publications
def list_publications(session: Session, published_only: bool = False):
    stmt = select(Publication)
    if published_only:
        stmt = stmt.where(Publication.status == "published")
    return list(session.execute(stmt.order_by(Publication.sort_order, Publication.created_at.desc())).scalars().all())


def get_publication(session: Session, pub_id):
    p = session.get(Publication, pub_id)
    if p is None:
        raise NotFoundError("Publicación no encontrada")
    return p


def create_publication(session: Session, data, created_by=None):
    p = Publication(**data.model_dump(), created_by=created_by)
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


def update_publication(session: Session, pub, data):
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(pub, k, v)
    session.commit()
    session.refresh(pub)
    return pub


def delete_publication(session: Session, pub):
    session.delete(pub)
    session.commit()


# News
def list_news(session: Session, published_only: bool = False):
    stmt = select(NewsItem)
    if published_only:
        stmt = stmt.where(NewsItem.status == "published")
    return list(session.execute(stmt.order_by(NewsItem.sort_order, NewsItem.published_at.desc().nullslast(), NewsItem.created_at.desc())).scalars().all())


def get_news(session: Session, news_id):
    n = session.get(NewsItem, news_id)
    if n is None:
        raise NotFoundError("Noticia no encontrada")
    return n


def create_news(session: Session, data, created_by=None):
    n = NewsItem(**data.model_dump(), created_by=created_by)
    session.add(n)
    session.commit()
    session.refresh(n)
    return n


def update_news(session: Session, item, data):
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    session.commit()
    session.refresh(item)
    return item


def delete_news(session: Session, item):
    session.delete(item)
    session.commit()
