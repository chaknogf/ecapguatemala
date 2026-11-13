"""Facturación por entregas: un pedido despachado en partes se factura por lo despachado,
y el resto puede despacharse y facturarse después sin reservas huérfanas."""
from __future__ import annotations

from decimal import Decimal

from tests.test_e2e_cycle import admin_env, customer, supplier


def _setup(client, session, tag: str):
    company, branch, wh, unit, tax, h = admin_env(client, session, tag)
    prod = client.post("/api/v1/catalog/products", json={
        "sku": f"PIN-{tag}", "name": "Pintura galón", "stock_unit_id": unit,
        "purchase_cost": "30", "sale_price": "50"}, headers=h).json()
    wid = client.get("/api/v1/warehouses", headers=h).json()[0]["id"]
    po = client.post("/api/v1/purchase-orders", json={
        "supplier_id": supplier(client, h, code=f"P-{tag}")["id"], "warehouse_id": wid,
        "lines": [{"product_id": prod["id"], "quantity": "20", "unit_cost": "30"}],
        "auto_approve": True}, headers=h).json()
    client.post(f"/api/v1/purchase-orders/{po['id']}/receipts",
                json={"received": [{"po_line_id": po["lines"][0]["id"], "quantity": "20"}]}, headers=h)
    cust = customer(client, h, code=f"C-{tag}")
    so = client.post("/api/v1/sales-orders", json={
        "customer_id": cust["id"], "warehouse_id": wid,
        "lines": [{"product_id": prod["id"], "quantity": "10"}]}, headers=h).json()
    assert client.post(f"/api/v1/sales-orders/{so['id']}/confirm", headers=h).status_code == 200
    return h, so["id"], so["lines"][0]["id"], prod["id"], wid


def _stock(client, h, pid, wid):
    row = client.get("/api/v1/stock", params={"product_id": pid, "warehouse_id": wid}, headers=h).json()[0]
    return Decimal(row["on_hand"]), Decimal(row["reserved"])


def _order(client, h, so_id):
    return client.get(f"/api/v1/sales-orders", headers=h).json()


class TestPartialInvoicing:
    def test_invoice_per_delivery_then_final_invoice_closes_order(self, client, session):
        h, so_id, line_id, pid, wid = _setup(client, session, "pi1")

        # Entrega 1: 4 de 10
        d1 = client.post(f"/api/v1/sales-orders/{so_id}/dispatch",
                         json={"items": [{"so_line_id": line_id, "quantity": "4"}]}, headers=h)
        assert d1.status_code == 201, d1.text
        so = next(o for o in _order(client, h, so_id) if o["id"] == so_id)
        assert so["status"] == "partial"

        # Factura 1: solo lo despachado (4), el pedido sigue abierto
        f1 = client.post("/api/v1/invoices", json={"order_id": so_id}, headers=h)
        assert f1.status_code == 201, f1.text
        assert Decimal(f1.json()["totals"]["base_total"]) == Decimal("200.00")  # 4 * 50
        so = next(o for o in _order(client, h, so_id) if o["id"] == so_id)
        assert so["status"] == "partial"
        assert Decimal(so["lines"][0]["quantity_invoiced"]) == Decimal("4")

        # El resto sigue reservado y se puede despachar (no quedó huérfano)
        on_hand, reserved = _stock(client, h, pid, wid)
        assert (on_hand, reserved) == (Decimal("16"), Decimal("6"))
        d2 = client.post(f"/api/v1/sales-orders/{so_id}/dispatch", json={}, headers=h)
        assert d2.status_code == 201, d2.text
        so = next(o for o in _order(client, h, so_id) if o["id"] == so_id)
        assert so["status"] == "dispatched"

        # Factura 2: solo lo pendiente (6)
        f2 = client.post("/api/v1/invoices", json={"order_id": so_id}, headers=h)
        assert f2.status_code == 201, f2.text
        assert Decimal(f2.json()["totals"]["base_total"]) == Decimal("300.00")
        so = next(o for o in _order(client, h, so_id) if o["id"] == so_id)
        assert so["status"] == "invoiced"
        assert _stock(client, h, pid, wid) == (Decimal("10"), Decimal("0"))

    def test_nothing_pending_cannot_be_invoiced_twice(self, client, session):
        h, so_id, line_id, pid, wid = _setup(client, session, "pi2")
        client.post(f"/api/v1/sales-orders/{so_id}/dispatch",
                    json={"items": [{"so_line_id": line_id, "quantity": "4"}]}, headers=h)
        assert client.post("/api/v1/invoices", json={"order_id": so_id}, headers=h).status_code == 201
        again = client.post("/api/v1/invoices", json={"order_id": so_id}, headers=h)
        assert again.status_code == 422
        assert "pendiente de facturar" in again.json()["message"]
