"""Anulación de recepciones de compra: stock y orden de compra quedan coherentes."""
from __future__ import annotations

from decimal import Decimal

from tests.conftest import login_headers, make_user
from tests.test_e2e_cycle import admin_env, supplier


def _po_with_receipt(client, session, tag: str, qty_ordered: str = "100", qty_received: str = "60"):
    company, branch, wh, unit, tax, h = admin_env(client, session, tag)
    sup = supplier(client, h, code=f"PRV-{tag}")
    prod = client.post(
        "/api/v1/catalog/products",
        json={"sku": f"ARR-{tag}", "name": "Arroz", "stock_unit_id": unit,
              "purchase_cost": "120", "sale_price": "160"},
        headers=h,
    ).json()
    po = client.post(
        "/api/v1/purchase-orders",
        json={"supplier_id": sup["id"], "warehouse_id": str(wh.id), "branch_id": str(branch.id),
              "lines": [{"product_id": prod["id"], "quantity": qty_ordered, "unit_cost": "120"}]},
        headers=h,
    ).json()
    client.post(f"/api/v1/purchase-orders/{po['id']}/approve", json={}, headers=h)
    line_id = client.get(f"/api/v1/purchase-orders/{po['id']}", headers=h).json()["lines"][0]["id"]
    rc = client.post(
        f"/api/v1/purchase-orders/{po['id']}/receipts",
        json={"received": [{"po_line_id": line_id, "quantity": qty_received}]},
        headers=h,
    )
    assert rc.status_code == 201, rc.text
    return h, po["id"], rc.json(), prod["id"], wh.id, company


def _stock(client, h, product_id, wh_id):
    rows = client.get("/api/v1/stock", params={"product_id": product_id, "warehouse_id": str(wh_id)}, headers=h).json()
    return Decimal(rows[0]["on_hand"]) if rows else Decimal("0")


class TestVoidReceipt:
    def test_void_restores_stock_and_order_then_order_can_be_cancelled(self, client, session):
        h, po_id, receipt, pid, wh_id, company = _po_with_receipt(client, session, "v1")
        assert _stock(client, h, pid, wh_id) == Decimal("60")

        r = client.post(
            f"/api/v1/purchase-orders/{po_id}/receipts/{receipt['id']}/void",
            json={"reason": "Factura del proveedor errónea"}, headers=h,
        )
        assert r.status_code == 200, r.text
        po = r.json()
        assert po["status"] == "approved"
        assert all(Decimal(l["quantity_received"]) == 0 for l in po["lines"])
        assert _stock(client, h, pid, wh_id) == Decimal("0")

        # Ya no hay recepciones: la orden se puede cancelar y la recepción anulada no vuelve a contar.
        c = client.post(f"/api/v1/purchase-orders/{po_id}/cancel",
                        json={"reason": "Se cancela la compra"}, headers=h)
        assert c.status_code == 200, c.text
        assert c.json()["status"] == "cancelled"

    def test_void_is_not_allowed_twice(self, client, session):
        h, po_id, receipt, pid, wh_id, company = _po_with_receipt(client, session, "v2")
        url = f"/api/v1/purchase-orders/{po_id}/receipts/{receipt['id']}/void"
        assert client.post(url, json={"reason": "Error de digitación"}, headers=h).status_code == 200
        again = client.post(url, json={"reason": "Error de digitación"}, headers=h)
        assert again.status_code == 422
        assert _stock(client, h, pid, wh_id) == Decimal("0")

    def test_generic_reversal_of_receipt_line_is_redirected_to_purchases(self, client, session):
        h, po_id, receipt, pid, wh_id, company = _po_with_receipt(client, session, "v3")
        mv = client.get("/api/v1/movements", params={"size": 50}, headers=h).json()
        receipt_line = next(l for m in mv if m["reference_document"] == receipt["document_number"] for l in m["lines"])
        r = client.post("/api/v1/movements/reverse",
                        json={"line_id": receipt_line["id"], "reason": "Intento directo"}, headers=h)
        assert r.status_code == 422
        assert "anule la recepción desde Compras" in r.json()["message"]
        assert _stock(client, h, pid, wh_id) == Decimal("60")

    def test_void_refused_when_stock_was_already_consumed(self, client, session):
        h, po_id, receipt, pid, wh_id, company = _po_with_receipt(client, session, "v4")
        out = client.post("/api/v1/movements", json={"movement_type": "return_out", "warehouse_id": str(wh_id),
                          "reason": "Consumo interno", "lines": [{"product_id": pid, "quantity": "50"}]}, headers=h)
        assert out.status_code == 201, out.text

        r = client.post(f"/api/v1/purchase-orders/{po_id}/receipts/{receipt['id']}/void",
                        json={"reason": "Recepción incorrecta"}, headers=h)
        assert r.status_code == 409, r.text  # stock insuficiente (código de dominio)
        assert "consumo posterior" in r.json()["message"]
        # Nada cambia: la recepción sigue confirmada y la OC sigue recibida parcialmente.
        po = client.get(f"/api/v1/purchase-orders/{po_id}", headers=h).json()
        assert po["status"] == "partial"
        assert Decimal(po["lines"][0]["quantity_received"]) == Decimal("60")
        assert _stock(client, h, pid, wh_id) == Decimal("10")

    def test_void_requires_inventory_adjustment_permission(self, client, session):
        h, po_id, receipt, pid, wh_id, company = _po_with_receipt(client, session, "v5")
        email = "compras.v5@example.com"
        make_user(session, company, email=email, roles=["compras"])
        session.commit()
        h2 = login_headers(client, email, "Correcta4Bateria", company.id)
        r = client.post(f"/api/v1/purchase-orders/{po_id}/receipts/{receipt['id']}/void",
                        json={"reason": "Sin permiso"}, headers=h2)
        assert r.status_code == 403
        assert _stock(client, h, pid, wh_id) == Decimal("60")


def test_generic_reversal_of_sale_dispatch_is_blocked(client, session):
    from tests.test_partial_invoicing import _setup
    h, so_id, line_id, pid, wid = _setup(client, session, "vd1")
    client.post(f"/api/v1/sales-orders/{so_id}/dispatch",
                json={"items": [{"so_line_id": line_id, "quantity": "4"}]}, headers=h)
    mv = client.get("/api/v1/movements", params={"size": 50}, headers=h).json()
    sale_line = next(l for m in mv if m["movement_type"] == "sale" for l in m["lines"])
    r = client.post("/api/v1/movements/reverse", json={"line_id": sale_line["id"], "reason": "Prueba"}, headers=h)
    assert r.status_code == 422
    assert "despacho de venta" in r.json()["message"]
