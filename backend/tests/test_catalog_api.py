from __future__ import annotations

import uuid
from decimal import Decimal

from tests.conftest import TestClient, login_headers, make_branch, make_company, make_user

def setup(client, session, policy=None):
    tag = uuid.uuid4().hex[:8]
    email = f"jefe.{tag}@example.com"
    company = make_company(session, f"Ferretería El Tornillo {tag} S.A.", policy=policy)
    branch, wh = make_branch(session, company)
    make_user(session, company, email=email, roles=["admin_empresa"], branch_id=branch.id)
    session.commit()
    headers = login_headers(client, email, "Correcta4Bateria", company.id)
    return company, branch, wh, headers


def _unit(client, headers, code="PZA", name="Pieza"):
    r = client.post("/api/v1/catalog/units", json={"code": code, "name": name}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


class TestCatalogAPI:
    def test_create_product_with_variant_and_barcode(self, client, session):
        company, branch, wh, h = setup(client, session)
        unit = _unit(client, h)
        r = client.post(
            "/api/v1/catalog/products",
            json={
                "sku": "CAM-001", "name": "Camisa denim", "stock_unit_id": unit,
                "sale_price": "120.00", "purchase_cost": "60.00",
                "variants": [
                    {"sku": "CAM-001-M-AZ", "barcode": "7700001", "attrs": {"talla": "M", "color": "azul"}, "sale_price": "125.00"},
                    {"sku": "CAM-001-L-NE", "barcode": "7700002", "attrs": {"talla": "L", "color": "negro"}},
                ],
            },
            headers=h,
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert len(body["variants"]) == 2
        # lookup por barcode de variante
        lk = client.get("/api/v1/catalog/lookup", params={"term": "7700002"}, headers=h)
        assert lk.status_code == 200
        assert lk.json()["variant"]["sku"] == "CAM-001-L-NE"
        # lookup por SKU
        lk2 = client.get("/api/v1/catalog/lookup", params={"term": "cam-001"}, headers=h)
        assert lk2.json()["product"]["sku"] == "CAM-001"
        # duplicado de SKU => 409
        dup = client.post(
            "/api/v1/catalog/products",
            json={"sku": "CAM-001", "name": "Otra"}, headers=h,
        )
        assert dup.status_code == 409

    def test_duplicate_barcode_rejected(self, client, session):
        company, branch, wh, h = setup(client, session)
        unit = _unit(client, h)
        r1 = client.post("/api/v1/catalog/products", json={"sku": "B1", "name": "Uno", "barcode": "123", "stock_unit_id": unit}, headers=h)
        assert r1.status_code == 201, r1.text
        r2 = client.post("/api/v1/catalog/products", json={"sku": "B2", "name": "Dos", "barcode": "123", "stock_unit_id": unit}, headers=h)
        assert r2.status_code == 409

    def test_extra_attrs_validated(self, client, session):
        company, branch, wh, h = setup(client, session)
        unit = _unit(client, h)
        ar = client.post(
            "/api/v1/catalog/attributes",
            json={"code": "calibre", "label": "Calibre", "value_type": "enum",
                  "enum_options": ["1/2", "3/4", "1"], "required": True},
            headers=h,
        )
        assert ar.status_code == 201, ar.text
        # sin el atributo obligatorio => 422
        bad = client.post("/api/v1/catalog/products", json={"sku": "TUBO", "name": "Tubo PVC", "stock_unit_id": unit, "extra_attrs": {}}, headers=h)
        assert bad.status_code == 422
        # valor inválido => 422
        bad2 = client.post("/api/v1/catalog/products", json={"sku": "TUBO", "name": "Tubo PVC", "stock_unit_id": unit, "extra_attrs": {"calibre": "2"}}, headers=h)
        assert bad2.status_code == 422
        # atributo no definido => 422
        bad3 = client.post("/api/v1/catalog/products", json={"sku": "TUBO", "name": "Tubo PVC", "stock_unit_id": unit, "extra_attrs": {"desconocido": "x"}}, headers=h)
        assert bad3.status_code == 422
        ok = client.post("/api/v1/catalog/products", json={"sku": "TUBO", "name": "Tubo PVC", "stock_unit_id": unit, "extra_attrs": {"calibre": "1/2"}}, headers=h)
        assert ok.status_code == 201, ok.text
        assert ok.json()["extra_attrs"]["calibre"] == "1/2"

    def test_service_cannot_control_lots(self, client, session):
        company, branch, wh, h = setup(client, session)
        r = client.post(
            "/api/v1/catalog/products",
            json={"sku": "SRV", "name": "Instalación", "product_type": "service", "track_lots": True},
            headers=h,
        )
        assert r.status_code == 422

    def test_negative_price_rejected(self, client, session):
        company, branch, wh, h = setup(client, session)
        r = client.post(
            "/api/v1/catalog/products",
            json={"sku": "NEG", "name": "Ilegal", "sale_price": "-5"},
            headers=h,
        )
        assert r.status_code == 422


class TestPricingMath:
    def test_margin_and_markup(self, client, session):
        company, branch, wh, h = setup(client, session)
        r = client.post(
            "/api/v1/catalog/pricing/analyze",
            json={"cost": "80", "price_with_tax": "120.8", "tax_rate_pct": "12", "tax_included": True, "target_margin_pct": "25"},
            headers=h,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["price_net"] == "107.86"
        assert Decimal(body["margin_pct"]) == Decimal("25.83")
        assert Decimal(body["markup_pct"]) == Decimal("34.83")
        assert body["gross_profit"] == "27.86"
        assert body["suggested_price_for_margin"] == "106.67"

    def test_zero_cost_no_division_error(self, client, session):
        company, branch, wh, h = setup(client, session)
        r = client.post(
            "/api/v1/catalog/pricing/analyze",
            json={"cost": "0", "price_net": "10"},
            headers=h,
        )
        assert r.status_code == 200
        assert r.json()["markup_pct"] is None  # sin división por cero

    def test_margin_100_rejected(self, client, session):
        company, branch, wh, h = setup(client, session)
        r = client.post(
            "/api/v1/catalog/pricing/analyze",
            json={"cost": "5", "target_margin_pct": "100"},
            headers=h,
        )
        assert r.status_code == 422

    def test_price_for_margin_unit(self, client, session):
        from app.modules.catalog.router import price_for_margin

        assert price_for_margin(Decimal("60"), Decimal("25")) == Decimal("80.00")


class TestInventoryAPI:
    def _product(self, client, h, unit, sku="MOV-1"):
        r = client.post(
            "/api/v1/catalog/products",
            json={"sku": sku, "name": "Producto mov", "stock_unit_id": unit, "min_stock": "5"},
            headers=h,
        )
        assert r.status_code == 201, r.text
        return r.json()["id"]

    def _warehouse(self, client, h):
        ws = client.get("/api/v1/warehouses", headers=h).json()
        return ws[0]["id"]

    def test_receipt_sale_and_kardex_via_api(self, client, session):
        company, branch, wh, h = setup(client, session)
        unit = _unit(client, h)
        pid = self._product(client, h, unit)
        wid = self._warehouse(client, h)

        key = uuid.uuid4().hex
        rec = client.post(
            "/api/v1/movements",
            json={"movement_type": "receipt", "warehouse_id": wid,
                  "reference_document": "OC-100", "idempotency_key": key,
                  "lines": [{"product_id": pid, "quantity": "50", "unit_cost": "10"}]},
            headers=h,
        )
        assert rec.status_code == 201, rec.text
        sale = client.post(
            "/api/v1/movements",
            json={"movement_type": "return_out", "warehouse_id": wid,
                  "reference_document": "V-1",
                  "lines": [{"product_id": pid, "quantity": "12"}]},
            headers=h,
        )
        assert sale.status_code == 201, sale.text

        stock = client.get("/api/v1/stock", params={"warehouse_id": wid}, headers=h).json()
        row = [s for s in stock if s["product_id"] == pid][0]
        assert row["on_hand"] == "38.0000"
        assert row["available"] == "38.0000"

        k = client.get("/api/v1/stock/kardex", params={"product_id": pid}, headers=h).json()
        assert k["reconciled"] is True
        assert Decimal(k["final_balance"]) == Decimal("38")
        assert [Decimal(m["in"]) for m in k["movements"]] == [Decimal("50"), Decimal("0")]
        assert [Decimal(m["out"]) for m in k["movements"]] == [Decimal("0"), Decimal("12")]

        low = client.get("/api/v1/stock", params={"only_low": True}, headers=h).json()
        assert all(s["stock_light"] != "normal" for s in low)

    def test_direct_sale_movement_is_rejected(self, client, session):
        company, branch, wh, h = setup(client, session)
        unit = _unit(client, h)
        pid = self._product(client, h, unit)
        wid = self._warehouse(client, h)
        client.post("/api/v1/movements", json={"movement_type": "receipt", "warehouse_id": wid,
                    "lines": [{"product_id": pid, "quantity": "5", "unit_cost": "2"}]}, headers=h)
        r = client.post("/api/v1/movements", json={"movement_type": "sale", "warehouse_id": wid,
                        "lines": [{"product_id": pid, "quantity": "1"}]}, headers=h)
        assert r.status_code == 422
        assert "pedido" in r.json()["message"]
        stock = client.get("/api/v1/stock", params={"warehouse_id": wid}, headers=h).json()
        assert [s for s in stock if s["product_id"] == pid][0]["on_hand"] == "5.0000"

    def test_count_and_reversal_types_are_rejected_not_500(self, client, session):
        company, branch, wh, h = setup(client, session)
        unit = _unit(client, h)
        pid = self._product(client, h, unit)
        wid = self._warehouse(client, h)
        for t in ("count", "reversal"):
            r = client.post("/api/v1/movements", json={"movement_type": t, "warehouse_id": wid,
                            "reason": "prueba", "lines": [{"product_id": pid, "quantity": "1"}]}, headers=h)
            assert r.status_code == 422, (t, r.text)

    def test_overdraft_rejected_via_api(self, client, session):
        company, branch, wh, h = setup(client, session)
        unit = _unit(client, h)
        pid = self._product(client, h, unit)
        wid = self._warehouse(client, h)
        r = client.post(
            "/api/v1/movements",
            json={"movement_type": "return_out", "warehouse_id": wid,
                  "lines": [{"product_id": pid, "quantity": "1"}]},
            headers=h,
        )
        assert r.status_code == 409
        assert "insuficientes" in r.json()["message"]

    def test_idempotency_key_replays_same_document(self, client, session):
        company, branch, wh, h = setup(client, session)
        unit = _unit(client, h)
        pid = self._product(client, h, unit)
        wid = self._warehouse(client, h)
        key = uuid.uuid4().hex
        body = {"movement_type": "receipt", "warehouse_id": wid, "idempotency_key": key,
                "lines": [{"product_id": pid, "quantity": "10", "unit_cost": "4"}]}
        r1 = client.post("/api/v1/movements", json=body, headers=h)
        r2 = client.post("/api/v1/movements", json=body, headers=h)
        assert r1.json()["id"] == r2.json()["id"]

    def test_adjustment_requires_reason_and_permission(self, client, session):
        company, branch, wh, h = setup(client, session)
        unit = _unit(client, h)
        pid = self._product(client, h, unit)
        wid = self._warehouse(client, h)
        rec = client.post("/api/v1/movements", json={
            "movement_type": "receipt", "warehouse_id": wid,
            "lines": [{"product_id": pid, "quantity": "10", "unit_cost": "4"}]}, headers=h)
        assert rec.status_code == 201, rec.text
        no_reason = client.post(
            "/api/v1/movements",
            json={"movement_type": "adjustment", "warehouse_id": wid,
                  "lines": [{"product_id": pid, "quantity": "2"}]},
            headers=h,
        )
        assert no_reason.status_code == 422
        with_reason = client.post(
            "/api/v1/movements",
            json={"movement_type": "adjustment", "warehouse_id": wid,
                  "reason": "Conteo físico: faltante de inventario",
                  "lines": [{"product_id": pid, "quantity": "-2"}]},
            headers=h,
        )
        assert with_reason.status_code == 201, with_reason.text
        # vendedor no puede ajustar
        make_user(session, company, email="vnd@example.com", roles=["vendedor"], branch_id=branch.id)
        session.commit()
        vh = login_headers(client, "vnd@example.com", "Correcta4Bateria", company.id)
        denied = client.post(
            "/api/v1/movements",
            json={"movement_type": "adjustment", "warehouse_id": wid, "reason": "prueba",
                  "lines": [{"product_id": pid, "quantity": "1"}]},
            headers=vh,
        )
        assert denied.status_code == 403

    def test_transfer_via_api(self, client, session):
        company, branch, wh, h = setup(client, session)
        unit = _unit(client, h)
        pid = self._product(client, h, unit)
        wid1 = self._warehouse(client, h)
        w2 = client.post(
            "/api/v1/warehouses",
            json={"branch_id": str(branch.id), "code": "ALM-02", "name": "Bodega 2"},
            headers=h,
        )
        assert w2.status_code == 201, w2.text
        wid2 = w2.json()["id"]
        client.post("/api/v1/movements", json={"movement_type": "receipt", "warehouse_id": wid1,
                  "lines": [{"product_id": pid, "quantity": "10", "unit_cost": "3"}]}, headers=h)
        tr = client.post(
            "/api/v1/movements/transfer",
            json={"from_warehouse_id": wid1, "to_warehouse_id": wid2,
                  "lines": [{"product_id": pid, "quantity": "4"}]},
            headers=h,
        )
        assert tr.status_code == 201, tr.text
        assert len(tr.json()["lines"]) == 2
        s1 = client.get("/api/v1/stock", params={"warehouse_id": wid1}, headers=h).json()
        s2 = client.get("/api/v1/stock", params={"warehouse_id": wid2}, headers=h).json()
        assert Decimal([x for x in s1 if x["product_id"] == pid][0]["on_hand"]) == Decimal("6")
        assert Decimal([x for x in s2 if x["product_id"] == pid][0]["on_hand"]) == Decimal("4")

    def test_reverse_via_api(self, client, session):
        company, branch, wh, h = setup(client, session)
        unit = _unit(client, h)
        pid = self._product(client, h, unit)
        wid = self._warehouse(client, h)
        rec = client.post("/api/v1/movements", json={"movement_type": "receipt", "warehouse_id": wid,
                        "lines": [{"product_id": pid, "quantity": "10", "unit_cost": "5"}]}, headers=h).json()
        line_id = rec["lines"][0]["id"]
        rev = client.post("/api/v1/movements/reverse",
                          json={"line_id": line_id, "reason": "Recepción digitada al doble"}, headers=h)
        assert rev.status_code == 201, rev.text
        assert Decimal(rev.json()["quantity"]) == Decimal("-10")
        assert rev.json()["reverses_line_id"] == line_id
        stock = client.get("/api/v1/stock", headers=h).json()
        assert Decimal([x for x in stock if x["product_id"] == pid][0]["on_hand"]) == Decimal("0")
        # original sigue vivo
        moves = client.get("/api/v1/movements", params={"product_id": pid}, headers=h).json()
        quantities = {str(l["quantity"]) for m in moves for l in m["lines"]}
        assert "10.0000" in quantities and "-10.0000" in quantities

    def test_expired_lot_blocked_via_api(self, client, session):
        company, branch, wh, h = setup(client, session)
        unit = _unit(client, h)
        p = client.post("/api/v1/catalog/products", json={
            "sku": "FARM-1", "name": "Amoxicilina", "stock_unit_id": unit,
            "track_lots": True, "track_expiry": True}, headers=h).json()
        wid = self._warehouse(client, h)
        from datetime import date, timedelta
        lot = client.post("/api/v1/lots", json={
            "product_id": p["id"], "lot_number": "VENC-1",
            "expiry_date": (date.today() - timedelta(days=2)).isoformat(),
            "acquisition_cost": "8"}, headers=h)
        assert lot.status_code == 201, lot.text
        lot_id = lot.json()["id"]
        client.post("/api/v1/movements", json={"movement_type": "receipt", "warehouse_id": wid,
                  "lines": [{"product_id": p["id"], "quantity": "20", "lot_id": lot_id, "unit_cost": "8"}]}, headers=h)
        sale = client.post("/api/v1/movements", json={"movement_type": "return_out", "warehouse_id": wid,
                       "lines": [{"product_id": p["id"], "quantity": "1", "lot_id": lot_id}]}, headers=h)
        assert sale.status_code == 422
        assert sale.json()["error"] == "expired_lot"
        exp = client.get("/api/v1/stock/lots/expiring", headers=h).json()
        assert any(x["lot_number"] == "VENC-1" and x["light"] == "black" for x in exp)


class TestAuditAPI:
    def test_sensitive_actions_are_logged_and_sanitized(self, client, session):
        company, branch, wh, h = setup(client, session)
        make_user(session, company, email="aud@example.com", roles=["auditor"])
        session.commit()
        ah = login_headers(client, "aud@example.com", "Correcta4Bateria", company.id)
        ev = client.get("/api/v1/audit/events", params={"entity_type": "user"}, headers=ah)
        assert ev.status_code == 200
        assert ev.json()
        for row in ev.json():
            blob = str(row)
            after = row.get("after") or {}
            assert "password_hash" not in after
            assert "argon2" not in blob
            assert "secret" not in blob.lower() or "correcta" not in blob.lower()
        # vendedor no puede leer auditoría
        make_user(session, company, email="v2@example.com", roles=["vendedor"])
        session.commit()
        vh = login_headers(client, "v2@example.com", "Correcta4Bateria", company.id)
        assert client.get("/api/v1/audit/events", headers=vh).status_code == 403
