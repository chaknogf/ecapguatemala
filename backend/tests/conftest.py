from __future__ import annotations

import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.db import Base, get_session
from app.core.security import hash_password
from app.main import create_app
from app.modules.identity import service as ids
from app.modules.identity.models import Role, User, UserCompanyMembership, UserRole
from app.modules.tenancy.models import Branch, Company, Warehouse

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://macbookairm2@localhost:5432/synvapp_test",
)

engine = create_engine(TEST_DB_URL)
TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def _wipe_schema():
    import sqlalchemy as sa
    from sqlalchemy import text

    if sa.inspect(engine).has_table("alembic_version"):
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM alembic_version"))
    Base.metadata.drop_all(engine)


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    """Esquema de pruebas creado con las MISMAS migraciones Alembic de producción."""
    _wipe_schema()
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", TEST_DB_URL)
    command.upgrade(cfg, "head")
    yield
    _wipe_schema()


@pytest.fixture()
def session():
    s = TestingSession()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture()
def client():
    app = create_app()

    def _override():
        s = TestingSession()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_session] = _override
    return TestClient(app)


def make_company(session, name: str | None = None, policy: dict | None = None) -> Company:
    company = Company(
        legal_name=name or f"Empresa {uuid.uuid4().hex[:8]} S.A.",
        trade_name=(name or "Comercial")[:100],
        inventory_policy=policy or {},
    )
    session.add(company)
    session.flush()
    ids.seed_system_roles(session, company.id)
    return company


def make_branch(session, company: Company, code: str = "BR01") -> tuple[Branch, Warehouse]:
    branch = Branch(company_id=company.id, code=code, name="Sucursal Central")
    session.add(branch)
    session.flush()
    wh = Warehouse(company_id=company.id, branch_id=branch.id, code="ALM-01", name="Almacén")
    session.add(wh)
    session.flush()
    return branch, wh


def make_user(
    session,
    company: Company | None,
    email: str | None = None,
    password: str = "Correcta4Bateria",
    roles: list[str] | None = None,
    platform_admin: bool = False,
    branch_id=None,
) -> User:
    user = User(
        email=email or f"u{uuid.uuid4().hex[:8]}@example.com",
        full_name="Usuario Prueba",
        password_hash=hash_password(password),
        is_platform_admin=platform_admin,
    )
    session.add(user)
    session.flush()
    if company is not None:
        membership = UserCompanyMembership(
            user_id=user.id, company_id=company.id, default_branch_id=branch_id
        )
        session.add(membership)
        session.flush()
        if roles:
            from sqlalchemy import select

            for code in roles:
                role = session.execute(
                    select(Role).where(Role.company_id == company.id, Role.code == code)
                ).scalar_one()
                session.add(UserRole(membership_id=membership.id, role_id=role.id))
    session.commit()
    return user


def login_headers(client: TestClient, email: str, password: str, company_id=None) -> dict:
    body = {"email": email, "password": password}
    if company_id:
        body["company_id"] = str(company_id)
    r = client.post("/api/v1/auth/login", json=body)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['tokens']['access_token']}"}


def new_product(session, company, warehouse, sku: str = None, **kw):
    from app.modules.catalog.models import Product

    defaults = dict(
        company_id=company.id,
        sku=sku or f"SKU-{uuid.uuid4().hex[:6].upper()}",
        name=f"Producto {uuid.uuid4().hex[:4]}",
        product_type="finished",
        purchase_cost=kw.pop("purchase_cost", 10),
        sale_price=kw.pop("sale_price", 20),
    )
    defaults.update(kw)
    p = Product(**defaults)
    session.add(p)
    session.flush()
    return p
