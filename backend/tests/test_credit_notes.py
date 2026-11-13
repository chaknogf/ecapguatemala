"""Anulación de facturas mediante nota de crédito."""
from __future__ import annotations

from decimal import Decimal

from tests.conftest import login_headers, make_user
from tests.test_e2e_cycle import admin_env, customer, supplier


def _invoiced_order(client, session, tag: str, dispatch_qty: str | None = None):
    """Pedido de 10 unidades a 50 + IVA 12% (base 500, total 560).
    Si dispatch_qty se indica, el despacho es parcial."""
    company, branch, wh, unit, tax, h = admin_env(client, session, tag)
    prod = client.post("/api/v1/catalog/products", json={
        "sku": f"NC-{tag}", "name": "Pintura", "stock_unit_id": unit,
        "purchase_cost": "30", "sale_price": "50"}, headers=h).json()
    wid = client.get("/api/v1/warehouses", headers=h).json()[0]["id"]
    po = client.post("/api/v1/purchase-orders", json={
        "supplier_id": supplier(client, h, code=f"NCP-{tag}")["id"], "warehouse_id": wid,
        "lines": [{"product_id": prod["id"], "quantity": "20", "unit_cost": "30"}],
        "auto_approve": True}, headers=h).json()
    client.post(f"/api/v1/purchase-orders/{po['id']}/receipts",
                json={"received": [{"po_line_id": po["lines"][0]["id"], "quantity": "20"}]}, headers=h)
    cust = customer(client, h, code=f"NCC-{tag}", payment_terms_days=15)
    so = client.post("/api/v1/sales-orders", json={
        "customer_id": cust["id"], "warehouse_id": wid,
        "lines": [{"product_id": prod["id"], "quantity": "10", "tax_rate_pct": "12"}]}, headers=h).json()
    client.post(f"/api/v1/sales-orders/{so['id']}/confirm", headers=h)
    if dispatch_qty:
        client.post(f"/api/v1/sales-orders/{so['id']}/dispatch",
                    json={"items": [{"so_line_id": so["lines"][0]["id"], "quantity": dispatch_qty}]}, headers=h)
    else:
        client.post(f"/api/v1/sales-orders/{so['id']}/dispatch", json={}, headers=h)
    inv = client.post("/api/v1/invoices", json={"order_id": so["id"], "payment_type": "credit"}, headers=h)
    assert inv.status_code == 201, inv.text
    return h, company, so["id"], inv.json(), cust["id"], wid


def _order(client, h, so_id):
    return next(o for o in client.get("/api/v1/sales-orders", headers=h).json() if o["id"] == so_id)


class TestCreditNote:
    def test_annul_creates_credit_note_and_removes_receivable(self, client, session):
        h, company, so_id, inv, cust_id, wid = _invoiced_order(client, session, "nc1")
        assert Decimal(inv["totals"]["grand_total"]) == Decimal("560.00")
        assert [r["document"] for r in client.get("/api/v1/receivables", headers=h).json()] == [inv["document_number"]]

        r = client.post(f"/api/v1/invoices/{inv['id']}/credit-note",
                        json={"reason": "Precio acordado mal digitado"}, headers=h)
        assert r.status_code == 201, r.text
        note = r.json()
        assert note["is_credit_note"] is True
        assert note["document_number"].startswith("NCV-01")
        assert Decimal(note["totals"]["grand_total"]) == Decimal("560.00")

        # La factura original queda marcada y ya no es cobrable
        invoices = {i["id"]: i for i in client.get("/api/v1/invoices", headers=h).json()}
        assert invoices[inv["id"]]["annulled_by"] == note["document_number"]
        assert client.get("/api/v1/receivables", headers=h).json() == []
        # Saldo neto del cliente (crédito) queda en cero
        dash = client.get("/api/v1/dashboard", params={"days": 30}, headers=h).json()
        assert Decimal(dash["receivables_balance"]) == Decimal("0")
        assert Decimal(dash["sales_gross_period"]) == Decimal("0")
        assert Decimal(dash["taxes_issued_period"]) == Decimal("0")

    def test_annulled_invoice_cannot_be_annulled_again_or_collected(self, client, session):
        h, company, so_id, inv, cust_id, wid = _invoiced_order(client, session, "nc2")
        assert client.post(f"/api/v1/invoices/{inv['id']}/credit-note",
                           json={"reason": "Error de cliente"}, headers=h).status_code == 201
        again = client.post(f"/api/v1/invoices/{inv['id']}/credit-note",
                            json={"reason": "Otra vez"}, headers=h)
        assert again.status_code == 422
        pm = client.post("/api/v1/payment-methods", json={"code": "EF2", "name": "Efectivo"}, headers=h).json()
        pay = client.post("/api/v1/payments", json={"invoice_id": inv["id"], "amount": "10",
                          "payment_method_id": pm["id"]}, headers=h)
        assert pay.status_code == 422
        assert "anulada" in pay.json()["message"]

    def test_annulled_order_can_be_invoiced_again(self, client, session):
        h, company, so_id, inv, cust_id, wid = _invoiced_order(client, session, "nc3", dispatch_qty="4")
        assert _order(client, h, so_id)["status"] == "partial"
        client.post(f"/api/v1/invoices/{inv['id']}/credit-note", json={"reason": "Factura duplicada"}, headers=h)
        o = _order(client, h, so_id)
        assert Decimal(o["lines"][0]["quantity_invoiced"]) == Decimal("0")
        assert o["status"] == "partial"
        again = client.post("/api/v1/invoices", json={"order_id": so_id, "payment_type": "credit"}, headers=h)
        assert again.status_code == 201, again.text
        assert Decimal(again.json()["totals"]["base_total"]) == Decimal("200.00")

    def test_invoice_with_payments_is_not_annulled(self, client, session):
        h, company, so_id, inv, cust_id, wid = _invoiced_order(client, session, "nc4")
        pm = client.post("/api/v1/payment-methods", json={"code": "EF3", "name": "Efectivo"}, headers=h).json()
        assert client.post("/api/v1/payments", json={"invoice_id": inv["id"], "amount": "100",
                           "payment_method_id": pm["id"]}, headers=h).status_code == 201
        r = client.post(f"/api/v1/invoices/{inv['id']}/credit-note", json={"reason": "Ya cobrada"}, headers=h)
        assert r.status_code == 422
        assert "cobros registrados" in r.json()["message"]

    def test_sales_user_cannot_annul_without_invoice_permission(self, client, session):
        h, company, so_id, inv, cust_id, wid = _invoiced_order(client, session, "nc5")
        email = "bodega.nc5@example.com"
        make_user(session, company, email=email, roles=["bodeguero"])
        session.commit()
        h2 = login_headers(client, email, "Correcta4Bateria", company.id)
        r = client.post(f"/api/v1/invoices/{inv['id']}/credit-note", json={"reason": "Sin permiso"}, headers=h2)
        assert r.status_code == 403
