from __future__ import annotations

import uuid

from tests.conftest import TestClient, make_company, make_user


class TestSelectCompany:
    """Regresión: admin de plataforma sin empresa activa que crea una y entra vía
    /auth/select-company — el flujo real de primer uso (onboarding) que consumió la UI."""

    def test_platform_admin_select_company_flow(self, client: TestClient, session):
        from app.modules.identity.models import User  # noqa

        email = f"plat.{uuid.uuid4().hex[:8]}@example.com"
        make_user(session, None, email=email, platform_admin=True)
        session.commit()

        # 1) login sin empresa: token restringido (sin cid), selection = False (0 empresas)
        login = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "Correcta4Bateria"},
        )
        assert login.status_code == 200, login.text
        rt = login.json()["tokens"]["refresh_token"]
        assert login.json()["user"]["company"] is None

        # 2) con el token restringido NO puede usar rutas de negocio (CompanyId exige cid)
        at0 = login.json()["tokens"]["access_token"]
        denied = client.get("/api/v1/companies/current", headers={"Authorization": f"Bearer {at0}"})
        assert denied.status_code == 401

        # 3) puede crear empresa como plataforma admin
        legal = f"Onboard {uuid.uuid4().hex[:6]} S.A."
        created = client.post(
            "/api/v1/companies",
            json={"legal_name": legal, "trade_name": "Onboard"},
            headers={"Authorization": f"Bearer {at0}"},
        )
        assert created.status_code == 201, created.text
        cid = created.json()["id"]

        # 4) select-company con el refresh token rota la familia y emite sesión con cid
        sel = client.post(
            "/api/v1/auth/select-company",
            json={"refresh_token": rt, "company_id": cid},
        )
        assert sel.status_code == 200, sel.text
        body = sel.json()
        assert body["user"]["company"]["id"] == cid
        assert "admin_empresa" in body["user"]["company"]["roles"]
        at1 = body["tokens"]["access_token"]

        # 5) la sesión ya funciona en rutas de negocio
        me = client.get("/api/v1/companies/current", headers={"Authorization": f"Bearer {at1}"})
        assert me.status_code == 200
        assert me.json()["legal_name"] == legal

        # 6) el refresh anterior ya fue rotado (un solo uso): reutilizarlo falla
        reuse = client.post("/api/v1/auth/refresh", json={"refresh_token": rt})
        assert reuse.status_code == 401

    def test_select_company_rejects_foreign_membership(self, client: TestClient, session):
        company = make_company(session, "Aja S.A.")
        email = f"otro.{uuid.uuid4().hex[:6]}@example.com"
        make_user(session, company, email=email)
        session.commit()
        login = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "Correcta4Bateria", "company_id": str(company.id)},
        )
        rt = login.json()["tokens"]["refresh_token"]
        foreign = uuid.uuid4()
        bad = client.post(
            "/api/v1/auth/select-company",
            json={"refresh_token": rt, "company_id": str(foreign)},
        )
        assert bad.status_code == 422
