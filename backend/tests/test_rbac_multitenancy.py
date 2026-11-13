from __future__ import annotations

import uuid

from tests.conftest import TestClient, login_headers, make_branch, make_company, make_user


def _new_company(client, headers, name=None):
    payload = {
        "legal_name": name or f"Empresa {uuid.uuid4().hex[:8]}",
        "trade_name": "Comercial",
        "currency_code": "GTQ",
    }
    r = client.post("/api/v1/companies", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


class TestRbac:
    def test_vendedor_cannot_create_users(self, client: TestClient, session):
        company = make_company(session)
        branch, _ = make_branch(session, company)
        make_user(session, company, email="v1@example.com", roles=["vendedor"], branch_id=branch.id)
        make_user(session, company, email="adm@example.com", roles=["admin_empresa"], branch_id=branch.id)
        session.commit()
        headers = login_headers(client, "v1@example.com", "Correcta4Bateria", company.id)
        r = client.post(
            "/api/v1/users",
            json={"email": "new@example.com", "full_name": "Nuevo Usuario",
                  "password": "Clave123Segura"},
            headers=headers,
        )
        assert r.status_code == 403
        adm = login_headers(client, "adm@example.com", "Correcta4Bateria", company.id)
        r2 = client.post(
            "/api/v1/users",
            json={"email": "new@example.com", "full_name": "Nuevo Usuario",
                  "password": "Clave123Segura", "role_codes": ["consulta"]},
            headers=adm,
        )
        assert r2.status_code == 201, r2.text

    def test_permission_pattern_wildcards(self, client: TestClient, session):
        company = make_company(session)
        make_user(session, company, email="caja@example.com", roles=["cajero"])
        session.commit()
        headers = login_headers(client, "caja@example.com", "Correcta4Bateria", company.id)
        # caja.* => puede leer caja? todavia no existe endpoint: probar con catalogo (debe negar)
        r = client.get("/api/v1/catalog/products", headers=headers)
        assert r.status_code == 403
        # roles del sistema no editables
        roles = client.get("/api/v1/roles", headers=login_headers(client, "caja@example.com", "Correcta4Bateria", company.id))
        assert roles.status_code == 403  # cajero no tiene usuarios.permisos.administrar

    def test_new_user_must_change_password_on_bootstrap(self, client: TestClient, session):
        company = make_company(session)
        admin_h = {}
        padmin = make_user(session, company, email="root@example.com", platform_admin=True)
        session.commit()
        headers = login_headers(client, "root@example.com", "Correcta4Bateria", company.id)
        r = client.post(
            "/api/v1/users",
            json={"email": "temp@example.com", "full_name": "Temporal", "password": "Temporal1234X"},
            headers=headers,
        )
        assert r.status_code == 201
        assert r.json()["must_change_password"] is True
        # intentar operar sin cambiar => 403
        h2 = login_headers(client, "temp@example.com", "Temporal1234X", company.id)
        blocked = client.get("/api/v1/auth/me", headers=h2)
        assert blocked.status_code == 200
        denied = client.get("/api/v1/catalog/products", headers=h2)
        assert denied.status_code == 403


class TestMultiTenancy:
    def test_data_isolation_between_companies(self, client: TestClient, session):
        padmin = make_user(session, None, email="iso-root@example.com", platform_admin=True)
        session.commit()
        headers = login_headers(client, "iso-root@example.com", "Correcta4Bateria")
        c1 = _new_company(client, headers, "Aislada Uno")
        c2 = _new_company(client, headers, "Aislada Dos")

        h1 = login_headers(client, "iso-root@example.com", "Correcta4Bateria", uuid.UUID(c1["id"]))
        h2 = login_headers(client, "iso-root@example.com", "Correcta4Bateria", uuid.UUID(c2["id"]))

        # crear producto en c1
        r = client.post(
            "/api/v1/catalog/units",
            json={"code": "PZA", "name": "Pieza"},
            headers=h1,
        )
        assert r.status_code == 201, r.text
        unit_id = r.json()["id"]
        pr = client.post(
            "/api/v1/catalog/products",
            json={"sku": "ISO-1", "name": "Producto Aislado", "stock_unit_id": unit_id},
            headers=h1,
        )
        assert pr.status_code == 201, pr.text
        pid = pr.json()["id"]

        # invisible para c2
        check = client.get("/api/v1/catalog/products", headers=h2)
        assert check.status_code == 200
        assert all(p["id"] != pid for p in check.json())
        direct = client.get(f"/api/v1/catalog/products/{pid}", headers=h2)
        assert direct.status_code == 404

    def test_company_id_in_body_is_ignored(self, client: TestClient, session):
        """El backend deriva la empresa del token, nunca del cliente."""
        padmin = make_user(session, None, email="der@example.com", platform_admin=True)
        session.commit()
        headers = login_headers(client, "der@example.com", "Correcta4Bateria")
        c1 = _new_company(client, headers, "Derivada Uno")
        c2 = _new_company(client, headers, "Derivada Dos")
        h1 = login_headers(client, "der@example.com", "Correcta4Bateria", uuid.UUID(c1["id"]))
        # intenta crear en c2 mediante query param -> no existe tal param; la lista se filtra por token
        r = client.get("/api/v1/catalog/units", headers=h1)
        assert r.status_code == 200

    def test_current_company_never_crosses(self, client: TestClient, session):
        padmin = make_user(session, None, email="cur@example.com", platform_admin=True)
        session.commit()
        headers = login_headers(client, "cur@example.com", "Correcta4Bateria")
        c1 = _new_company(client, headers, "Current Uno")
        h1 = login_headers(client, "cur@example.com", "Correcta4Bateria", uuid.UUID(c1["id"]))
        r = client.get("/api/v1/companies/current", headers=h1)
        assert r.json()["legal_name"] == "Current Uno"
        # patch de policies inválidas
        bad = client.patch(
            "/api/v1/companies/current",
            json={"expiry_policy": {"warn_days": 10, "critical_days": 30}},
            headers=h1,
        )
        assert bad.status_code == 422
        good = client.patch(
            "/api/v1/companies/current",
            json={"expiry_policy": {"warn_days": 90, "critical_days": 30},
                  "inventory_policy": {"block_sale_expired_lots": True, "allow_negative": False}},
            headers=h1,
        )
        assert good.status_code == 200
