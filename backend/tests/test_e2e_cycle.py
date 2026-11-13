from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from tests.conftest import TestClient, login_headers, make_branch, make_company, make_user


def admin_env(client: TestClient, session, tag: str):
    """Empresas administradas vía API: admin de empresa + bodega + catálogo base."""
    email = f"admin.{tag}@example.com"
    company = make_company(session, f"Mayorista {tag} S.A.")
    branch, wh = make_branch(session, company)
    make_user(session, company, email=email, roles=["admin_empresa"], branch_id=branch.id)
    session.commit()
    h = login_headers(client, email, "Correcta4Bateria", company.id)
    unit = client.post("/api/v1/catalog/units", json={"code": "PZA", "name": "Pieza"}, headers=h).json()["id"]
    tax = client.post(
        "/api/v1/catalog/taxes", json={"code": "IVA", "name": "IVA 12%", "rate": "12"},
        headers=h,
    ).json()
    return company, branch, wh, unit, tax, h


def supplier(client, h, code="PRV-1"):
    r = client.post("/api/v1/suppliers", json={"code": code, "name": "Distribuidora Nacional"}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def customer(client, h, code="CLI-1", **kw):
    body = {"code": code, "name": "Comercial La Esquina", "party_type": "company", **kw}
    r = client.post("/api/v1/customers", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


class TestPurchaseCycle:
    def test_full_cycle_po_partial_receipt_stock_only_on_receipt(self, client, session):
        company, branch, wh, unit, tax, h = admin_env(client, session, "comp")
        sup = supplier(client, h)
        prod = client.post(
            "/api/v1/catalog/products",
            json={"sku": "ARROZ-25", "name": "Arroz bolsa 25kg", "stock_unit_id": unit,
                  "purchase_cost": "120", "sale_price": "160",
                  "tax_id": tax["id"], "tax_treatment": "taxed"},
            headers=h,
        ).json()

        # OC creada y aprobada: el stock NO cambia (§9)
        po = client.post(
            "/api/v1/purchase-orders",
            json={"supplier_id": sup["id"], "warehouse_id": str(wh.id), "branch_id": str(branch.id),
                  "lines": [{"product_id": prod["id"], "quantity": "100", "unit_cost": "120",
                             "tax_rate_pct": "12"}]},
            headers=h,
        )
        assert po.status_code == 201, po.text
        po_id = po.json()["id"]
        assert po.json()["document_number"].startswith("OC-01")
        stock0 = client.get("/api/v1/stock", params={"product_id": prod["id"]}, headers=h).json()
        assert stock0 == []

        ap = client.post(f"/api/v1/purchase-orders/{po_id}/approve", json={}, headers=h)
        assert ap.status_code == 200
        assert ap.json()["status"] == "approved"
        assert client.get("/api/v1/stock", params={"product_id": prod["id"]}, headers=h).json() == []

        # recepción parcial: 60 de 100
        po_lines = client.get(f"/api/v1/purchase-orders/{po_id}", headers=h).json()["lines"]
        rc = client.post(
            f"/api/v1/purchase-orders/{po_id}/receipts",
            json={"received": [{"po_line_id": po_lines[0]["id"], "quantity": "60"}],
                  "supplier_invoice_number": "FACT-NAC-001"},
            headers=h,
        )
        assert rc.status_code == 201, rc.text
        assert rc.json()["document_number"].startswith("RCC-01")
        stock1 = client.get("/api/v1/stock", params={"product_id": prod["id"]}, headers=h).json()
        assert Decimal(stock1[0]["on_hand"]) == Decimal("60")
        assert Decimal(stock1[0]["unit_cost"]) == Decimal("120")

        # estado parcial y pendientes
        po_after = client.get(f"/api/v1/purchase-orders/{po_id}", headers=h).json()
        assert po_after["status"] == "partial"
        pend = client.get(f"/api/v1/purchase-orders/{po_id}/pending", headers=h).json()
        assert Decimal(pend["pending"][0]["pending"]) == Decimal("40")

        # sobre-recepción rechazada
        over = client.post(
            f"/api/v1/purchase-orders/{po_id}/receipts",
            json={"received": [{"po_line_id": po_lines[0]["id"], "quantity": "50"}]},
            headers=h,
        )
        assert over.status_code == 422

        # completar recepción
        done = client.post(
            f"/api/v1/purchase-orders/{po_id}/receipts",
            json={"received": [{"po_line_id": po_lines[0]["id"], "quantity": "40"}]},
            headers=h,
        )
        assert done.status_code == 201
        assert client.get(f"/api/v1/purchase-orders/{po_id}", headers=h).json()["status"] == "received"
        assert client.get("/api/v1/stock", params={"product_id": prod["id"]}, headers=h).json()[0]["on_hand"] == "100.0000"

    def test_receipt_lots_for_tracked_product(self, client, session):
        company, branch, wh, unit, tax, h = admin_env(client, session, "farma")
        sup = supplier(client, h, code="LAB-1")
        prod = client.post(
            "/api/v1/catalog/products",
            json={"sku": "AMI-500", "name": "Amoxicilina 500mg", "stock_unit_id": unit,
                  "track_lots": True, "track_expiry": True, "purchase_cost": "8"},
            headers=h,
        ).json()
        po = client.post(
            "/api/v1/purchase-orders",
            json={"supplier_id": sup["id"], "warehouse_id": str(wh.id), "auto_approve": True,
                  "lines": [{"product_id": prod["id"], "quantity": "200", "unit_cost": "8"}]},
            headers=h,
        ).json()
        line = po["lines"][0]
        rc = client.post(
            f"/api/v1/purchase-orders/{po['id']}/receipts",
            json={"received": [{"po_line_id": line["id"], "quantity": "200",
                                "lot_number": "A-2026-01",
                                "expiry_date": (date.today() + timedelta(days=365)).isoformat()}]},
            headers=h,
        )
        assert rc.status_code == 201, rc.text
        lots = client.get("/api/v1/lots", params={"product_id": prod["id"]}, headers=h).json()
        assert lots[0]["lot_number"] == "A-2026-01"
        assert lots[0]["status"] == "active"
        stock = client.get("/api/v1/stock", params={"product_id": prod["id"]}, headers=h).json()
        assert stock[0]["lot_number"] == "A-2026-01"


class TestSalesCycle:
    def test_full_cycle_order_reserve_dispatch_invoice_payment(self, client, session):
        company, branch, wh, unit, tax, h = admin_env(client, session, "vent")
        prod = client.post(
            "/api/v1/catalog/products",
            json={"sku": "GAL-1", "name": "Pintura galón", "stock_unit_id": unit,
                  "purchase_cost": "30", "sale_price": "50",
                  "tax_id": tax["id"], "tax_treatment": "taxed"},
            headers=h,
        ).json()
        wid = client.get("/api/v1/warehouses", headers=h).json()[0]["id"]
        po = client.post("/api/v1/purchase-orders", json={
            "supplier_id": supplier(client, h)["id"], "warehouse_id": wid,
            "lines": [{"product_id": prod["id"], "quantity": "20", "unit_cost": "30"}],
            "auto_approve": True}, headers=h).json()
        line = po["lines"][0]
        client.post(f"/api/v1/purchase-orders/{po['id']}/receipts",
                    json={"received": [{"po_line_id": line["id"], "quantity": "20"}]}, headers=h)

        cust = customer(client, h)
        so = client.post("/api/v1/sales-orders", json={
            "customer_id": cust["id"], "warehouse_id": wid,
            "lines": [{"product_id": prod["id"], "quantity": "5",
                       "tax_rate_pct": "12"}]}, headers=h)
        assert so.status_code == 201, so.text
        so_id = so.json()["id"]
        assert so.json()["lines"][0]["amount_total"] == "280.00"  # 5*50 * 1.12

        # confirmar reserva (no mueve stock)
        cf = client.post(f"/api/v1/sales-orders/{so_id}/confirm", headers=h)
        assert cf.status_code == 200, cf.text
        st = client.get("/api/v1/stock", params={"product_id": prod["id"]}, headers=h).json()[0]
        assert Decimal(st["on_hand"]) == Decimal("20")
        assert Decimal(st["reserved"]) == Decimal("5")
        assert Decimal(st["available"]) == Decimal("15")

        # otro pedido no puede reservar más allá de disponibles
        so2 = client.post("/api/v1/sales-orders", json={
            "customer_id": cust["id"], "warehouse_id": wid,
            "lines": [{"product_id": prod["id"], "quantity": "20", "tax_rate_pct": "12"}]},
            headers=h).json()
        cf2 = client.post(f"/api/v1/sales-orders/{so2['id']}/confirm", headers=h)
        assert cf2.status_code == 409  # insufficient_stock

        # despacho total
        dsp = client.post(f"/api/v1/sales-orders/{so_id}/dispatch", json={}, headers=h)
        assert dsp.status_code == 201, dsp.text
        st2 = client.get("/api/v1/stock", params={"product_id": prod["id"]}, headers=h).json()[0]
        assert Decimal(st2["on_hand"]) == Decimal("15")
        assert Decimal(st2["reserved"]) == Decimal("0")

        # factura desde despacho: snapshot histórico
        inv = client.post("/api/v1/invoices", json={"order_id": so_id}, headers=h)
        assert inv.status_code == 201, inv.text
        inv_body = inv.json()
        assert inv_body["status"] == "issued"
        assert inv_body["document_number"].startswith("FAC-01")
        totals = inv_body["totals"]
        assert Decimal(totals["base_total"]) == Decimal("250.00")
        assert Decimal(totals["tax_total"]) == Decimal("30.00")
        assert Decimal(totals["grand_total"]) == Decimal("280.00")

        # cambiar catálogo NO altera la factura emitida
        client.patch(f"/api/v1/catalog/products/{prod['id']}", json={"sale_price": "70"}, headers=h)
        inv_after = client.get(f"/api/v1/invoices", headers=h).json()[0]
        assert Decimal(inv_after["totals"]["grand_total"]) == Decimal("280.00")
        assert Decimal(inv_after["lines"][0]["unit_price_net"]) == Decimal("50")

        # pagos parciales hasta saldar
        pm = client.post("/api/v1/payment-methods", json={"code": "EF", "name": "Efectivo"}, headers=h).json()
        p1 = client.post("/api/v1/payments", json={
            "invoice_id": inv_body["id"], "amount": "100", "payment_method_id": pm["id"]}, headers=h)
        assert p1.status_code == 201, p1.text
        recv = client.get("/api/v1/receivables", headers=h).json()
        assert Decimal(recv[0]["balance"]) == Decimal("180.00")
        # sobre-pago rechazado
        over = client.post("/api/v1/payments", json={
            "invoice_id": inv_body["id"], "amount": "181", "payment_method_id": pm["id"]}, headers=h)
        assert over.status_code == 422
        client.post("/api/v1/payments", json={
            "invoice_id": inv_body["id"], "amount": "180", "payment_method_id": pm["id"]}, headers=h)
        assert client.get("/api/v1/receivables", headers=h).json() == []

    def test_discount_exceeding_customer_policy_rejected(self, client, session):
        company, branch, wh, unit, tax, h = admin_env(client, session, "desc")
        prod = client.post("/api/v1/catalog/products", json={
            "sku": "S1", "name": "Artículo", "stock_unit_id": unit, "sale_price": "100"}, headers=h).json()
        cust = customer(client, h, code="CLI-D", max_discount_pct="10")
        wid = client.get("/api/v1/warehouses", headers=h).json()[0]["id"]
        bad = client.post("/api/v1/sales-orders", json={
            "customer_id": cust["id"], "warehouse_id": wid,
            "lines": [{"product_id": prod["id"], "quantity": "1", "unit_price": "100",
                       "discount_pct": "25"}]}, headers=h)
        assert bad.status_code == 422
        ok = client.post("/api/v1/sales-orders", json={
            "customer_id": cust["id"], "warehouse_id": wid,
            "lines": [{"product_id": prod["id"], "quantity": "1", "unit_price": "100",
                       "discount_pct": "8"}]}, headers=h)
        assert ok.status_code == 201, ok.text
        assert Decimal(ok.json()["lines"][0]["amount_total"]) == Decimal("92.00")

    def test_credit_limit_blocks_invoice(self, client, session):
        company, branch, wh, unit, tax, h = admin_env(client, session, "cred")
        prod = client.post("/api/v1/catalog/products", json={
            "sku": "C1", "name": "Mercancía", "stock_unit_id": unit, "sale_price": "500"}, headers=h).json()
        wid = client.get("/api/v1/warehouses", headers=h).json()[0]["id"]
        po = client.post("/api/v1/purchase-orders", json={
            "supplier_id": supplier(client, h)["id"], "warehouse_id": wid, "auto_approve": True,
            "lines": [{"product_id": prod["id"], "quantity": "10", "unit_cost": "200"}]}, headers=h).json()
        client.post(f"/api/v1/purchase-orders/{po['id']}/receipts",
                    json={"received": [{"po_line_id": po["lines"][0]["id"], "quantity": "10"}]}, headers=h)
        cust = customer(client, h, code="CLI-C", credit_limit="1000")
        so = client.post("/api/v1/sales-orders", json={
            "customer_id": cust["id"], "warehouse_id": wid,
            "lines": [{"product_id": prod["id"], "quantity": "3", "unit_price": "500"}]}, headers=h).json()
        client.post(f"/api/v1/sales-orders/{so['id']}/confirm", headers=h)
        client.post(f"/api/v1/sales-orders/{so['id']}/dispatch", json={}, headers=h)
        denied = client.post("/api/v1/invoices", json={"order_id": so["id"], "payment_type": "credit"}, headers=h)
        assert denied.status_code == 422
        assert "crédito" in denied.json()["message"]
        cash = client.post("/api/v1/invoices", json={"order_id": so["id"], "payment_type": "cash"}, headers=h)
        assert cash.status_code == 201, cash.text

    def test_fefo_dispatch_picks_soonest_lot(self, client, session):
        company, branch, wh, unit, tax, h = admin_env(client, session, "fefo")
        prod = client.post("/api/v1/catalog/products", json={
            "sku": "MED-1", "name": "Medicamento", "stock_unit_id": unit,
            "track_lots": True, "track_expiry": True, "purchase_cost": "10"}, headers=h).json()
        wid = client.get("/api/v1/warehouses", headers=h).json()[0]["id"]
        po = client.post("/api/v1/purchase-orders", json={
            "supplier_id": supplier(client, h)["id"], "warehouse_id": wid, "auto_approve": True,
            "lines": [{"product_id": prod["id"], "quantity": "100", "unit_cost": "10"}]}, headers=h).json()
        line_id = po["lines"][0]["id"]
        for lot, days, qty in [("L-CERCANO", 30, 40), ("L-LEJANO", 300, 60)]:
            client.post(f"/api/v1/purchase-orders/{po['id']}/receipts", json={
                "received": [{"po_line_id": line_id, "quantity": str(qty), "lot_number": lot,
                              "expiry_date": (date.today() + timedelta(days=days)).isoformat()}]},
                headers=h)
        cust = customer(client, h, code="CLI-F")
        so = client.post("/api/v1/sales-orders", json={
            "customer_id": cust["id"], "warehouse_id": wid,
            "lines": [{"product_id": prod["id"], "quantity": "50"}]}, headers=h).json()
        client.post(f"/api/v1/sales-orders/{so['id']}/confirm", headers=h)
        dsp = client.post(f"/api/v1/sales-orders/{so['id']}/dispatch", json={}, headers=h)
        assert dsp.status_code == 201, dsp.text
        lots_used = [l["lot_id"] for l in dsp.json()["lines"]]
        lots = client.get("/api/v1/lots", params={"product_id": prod["id"]}, headers=h).json()
        lot_by_id = {l["id"]: l["lot_number"] for l in lots}
        names = [lot_by_id[x] for x in lots_used]
        assert "L-CERCANO" in names  # FEFO consumió primero el lote próximo a vencer
        remaining = client.get("/api/v1/stock", params={"product_id": prod["id"]}, headers=h).json()
        by_lot = {x["lot_number"]: Decimal(x["on_hand"]) for x in remaining}
        assert by_lot["L-CERCANO"] == Decimal("0")   # agotado FEFO
        assert by_lot["L-LEJANO"] == Decimal("50")   # 60 - 10
