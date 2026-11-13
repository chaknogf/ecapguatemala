from __future__ import annotations

from tests.conftest import TestClient, login_headers, make_company, make_user


class TestLogin:
    def test_login_ok_returns_tokens(self, client: TestClient, session):
        company = make_company(session, "Farmacia La Salud S.A.")
        user = make_user(session, company, email="ana@example.com")
        session.commit()
        r = client.post(
            "/api/v1/auth/login",
            json={"email": "ana@example.com", "password": "Correcta4Bateria",
                  "company_id": str(company.id)},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["tokens"]["access_token"]
        assert data["tokens"]["refresh_token"]
        assert data["user"]["company"]["id"] == str(company.id)

    def test_login_bad_password_401(self, client: TestClient, session):
        company = make_company(session)
        user = make_user(session, company, email="bad@example.com")
        session.commit()
        r = client.post(
            "/api/v1/auth/login",
            json={"email": "bad@example.com", "password": "Incorrecta1234"},
        )
        assert r.status_code == 401

    def test_lockout_after_max_attempts(self, client: TestClient, session):
        company = make_company(session)
        make_user(session, company, email="lock@example.com")
        session.commit()
        for _ in range(5):
            r = client.post(
                "/api/v1/auth/login",
                json={"email": "lock@example.com", "password": "Incorrecta1234"},
            )
            assert r.status_code == 401
        r = client.post(
            "/api/v1/auth/login",
            json={"email": "lock@example.com", "password": "Correcta4Bateria"},
        )
        assert r.status_code == 401
        assert "intentos fallidos" in r.json()["message"].lower()

    def test_login_other_company_denied(self, client: TestClient, session):
        c1 = make_company(session, "Uno S.A.")
        c2 = make_company(session, "Dos S.A.")
        make_user(session, c1, email="solo1@example.com")
        session.commit()
        r = client.post(
            "/api/v1/auth/login",
            json={"email": "solo1@example.com", "password": "Correcta4Bateria",
                  "company_id": str(c2.id)},
        )
        assert r.status_code == 422


class TestRefresh:
    def test_refresh_rotates_and_detects_reuse(self, client: TestClient, session):
        company = make_company(session)
        user = make_user(session, company, email="r@example.com")
        session.commit()
        login = client.post(
            "/api/v1/auth/login",
            json={"email": "r@example.com", "password": "Correcta4Bateria",
                  "company_id": str(company.id)},
        ).json()
        rt = login["tokens"]["refresh_token"]

        refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": rt})
        assert refreshed.status_code == 200
        rt2 = refreshed.json()["tokens"]["refresh_token"]
        assert rt2 != rt

        reuse = client.post("/api/v1/auth/refresh", json={"refresh_token": rt})
        assert reuse.status_code == 401
        # Tras reuso, la familia completa queda revocada: rt2 también inválida
        second = client.post("/api/v1/auth/refresh", json={"refresh_token": rt2})
        assert second.status_code == 401

    def test_access_token_carries_company_permissions(self, client: TestClient, session):
        company = make_company(session)
        make_user(session, company, email="v@example.com", roles=["vendedor"])
        session.commit()
        headers = login_headers(client, "v@example.com", "Correcta4Bateria", company.id)
        me = client.get("/api/v1/auth/me", headers=headers)
        assert me.status_code == 200
        assert "vendedor" in me.json()["company"]["roles"]


class TestChangePassword:
    def test_change_password_and_relogin(self, client: TestClient, session):
        company = make_company(session)
        make_user(session, company, email="cp@example.com")
        session.commit()
        headers = login_headers(client, "cp@example.com", "Correcta4Bateria", company.id)
        r = client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "Correcta4Bateria", "new_password": "NuevaClave9Segura"},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        h2 = login_headers(client, "cp@example.com", "NuevaClave9Segura", company.id)
        assert client.get("/api/v1/auth/me", headers=h2).status_code == 200
        # sesión anterior invalidada (refresh revocado tras cambio)

    def test_weak_password_rejected(self, client: TestClient, session):
        company = make_company(session)
        make_user(session, company, email="weak@example.com")
        session.commit()
        headers = login_headers(client, "weak@example.com", "Correcta4Bateria", company.id)
        r = client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "Correcta4Bateria", "new_password": "Corta1"},
            headers=headers,
        )
        assert r.status_code == 422
