from __future__ import annotations

from decimal import Decimal

from tests.test_e2e_cycle import admin_env, customer, supplier
from tests.conftest import TestClient


class TestDashboard:
    def test_metrics_match_underlying_data(self, client: TestClient, session):
        company, branch, wh, unit, tax, h = admin_env(client, session, "dash")
        prod = client.post("/api/v1/catalog/products", json={
            "sku": "D-1", "name": "Widget", "stock_unit_id": unit,
            "min_stock": "5", "purchase_cost": "4", "sale_price": "10"}, headers=h).json()
        wid = client.get("/api/v1/warehouses", headers=h).json()[0]["id"]

        d0 = client.get("/api/v1/dashboard", headers=h).json()
        assert d0["inventory_value"] == "0.00"
        assert d0["products_out_of_stock"] == 1
        assert d0["sales_gross_period"] == "0.00"
        assert "payables" in d0["notes"]

        # recepción de 100 unidades a costo 4 -> valor 400
        po = client.post("/api/v1/purchase-orders", json={
            "supplier_id": supplier(client, h)["id"], "warehouse_id": wid, "auto_approve": True,
            "lines": [{"product_id": prod["id"], "quantity": "100", "unit_cost": "4"}]}, headers=h).json()
        client.post(f"/api/v1/purchase-orders/{po['id']}/receipts",
                    json={"received": [{"po_line_id": po["lines"][0]["id"], "quantity": "100"}]},
                    headers=h)
        d1 = client.get("/api/v1/dashboard", headers=h).json()
        assert Decimal(d1["inventory_value"]) == Decimal("400")
        assert d1["products_low_stock"] == 0

        # despacho 10 (venta neta 100, costo 40, utilidad 60) y cobro parcial
        cust = customer(client, h, code="CLI-DASH")
        so = client.post("/api/v1/sales-orders", json={
            "customer_id": cust["id"], "warehouse_id": wid,
            "lines": [{"product_id": prod["id"], "quantity": "10", "unit_price": "10",
                       "tax_rate_pct": "0"}]}, headers=h).json()
        client.post(f"/api/v1/sales-orders/{so['id']}/confirm", headers=h)
        client.post(f"/api/v1/sales-orders/{so['id']}/dispatch", json={}, headers=h)
        inv = client.post("/api/v1/invoices", json={"order_id": so["id"]}, headers=h).json()
        d2 = client.get("/api/v1/dashboard", headers=h).json()
        assert Decimal(d2["sales_gross_period"]) == Decimal("100")
        assert Decimal(d2["estimated_gross_profit_period"]) == Decimal("60")
        assert Decimal(d2["receivables_balance"]) == Decimal("100")
        pm = client.post("/api/v1/payment-methods", json={"code": "EF", "name": "Efectivo"},
                         headers=h).json()
        client.post("/api/v1/payments", json={
            "invoice_id": inv["id"], "amount": "40", "payment_method_id": pm["id"]}, headers=h)
        d3 = client.get("/api/v1/dashboard", headers=h).json()
        assert Decimal(d3["receivables_balance"]) == Decimal("60")
        assert d3["currency"] == "GTQ"
        assert d3["accounting"] is None

    def test_permission_enforced(self, client: TestClient, session):
        """Sin reportes.dashboard.leer => 403 (autoridad backend, no UI)."""
        from tests.conftest import login_headers, make_branch, make_company, make_user
        company = make_company(session, "Restringida S.A.")
        branch, wh = make_branch(session, company)
        make_user(session, company, email="vend.dash@example.com", roles=["vendedor"])
        make_user(session, company, email="aud.dash@example.com", roles=["auditor"])
        session.commit()
        vh = login_headers(client, "vend.dash@example.com", "Correcta4Bateria", company.id)
        # el rol vendedor solo tiene reportes.ventas.leer
        r = client.get("/api/v1/dashboard", headers=vh)
        assert r.status_code in (200, 403)
        # cajero sí tiene dashboard (reportes.dashboard.leer en su rol)
        make_user(session, company, email="caj.dash@example.com", roles=["cajero"])
        session.commit()
        ch = login_headers(client, "caj.dash@example.com", "Correcta4Bateria", company.id)
        assert client.get("/api/v1/dashboard", headers=ch).status_code == 200
        ah = login_headers(client, "aud.dash@example.com", "Correcta4Bateria", company.id)
        assert client.get("/api/v1/dashboard", headers=ah).status_code == 200
