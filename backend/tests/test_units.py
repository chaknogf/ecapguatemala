"""Pruebas unitarias del motor de cálculo (Decimal exacto, sin tocar BD)."""
from decimal import Decimal

import pytest

from app.core.errors import BusinessRuleError
from app.core.permissions import has_permission, pattern_matches
from app.modules.catalog.router import margin_on_price, markup_on_cost, price_for_markup, price_for_margin
from app.modules.fiscal.engine import compute_line, merge_totals


class TestMarginMath:
    def test_margin_on_price(self):
        assert margin_on_price(Decimal("100"), Decimal("60")) == Decimal("40.00")

    def test_margin_zero_price_guard(self):
        with pytest.raises(BusinessRuleError):
            margin_on_price(Decimal("0"), Decimal("5"))

    def test_markup_guard_zero_cost(self):
        with pytest.raises(BusinessRuleError):
            markup_on_cost(Decimal("10"), Decimal("0"))

    def test_price_for_margin_inverse(self):
        price = price_for_margin(Decimal("60"), Decimal("40"))
        assert price == Decimal("100.00")
        assert margin_on_price(price, Decimal("60")) == Decimal("40.00")

    def test_price_for_markup_inverse(self):
        price = price_for_markup(Decimal("100"), Decimal("25"))
        assert price == Decimal("125.00")
        assert markup_on_cost(price, Decimal("100")) == Decimal("25.00")

    def test_margin_100_blocked(self):
        with pytest.raises(BusinessRuleError):
            price_for_margin(Decimal("10"), Decimal("100"))


class TestTaxEngine:
    def test_taxes_added(self):
        r = compute_line(quantity=Decimal("2"), unit_price_net=Decimal("50"),
                         tax_rate_pct=Decimal("12"))
        assert r["base"] == Decimal("100.00")
        assert r["tax_amount"] == Decimal("12.00")
        assert r["total"] == Decimal("112.00")

    def test_taxes_included_extract(self):
        r = compute_line(quantity=Decimal("1"), unit_price_net=Decimal("112"),
                         tax_rate_pct=Decimal("12"), tax_included_in_price=True)
        assert r["base"] == Decimal("100.00")
        assert r["tax_amount"] == Decimal("12.00")

    def test_discount_before_taxes(self):
        r = compute_line(quantity=Decimal("1"), unit_price_net=Decimal("100"),
                         discount_pct=Decimal("10"), tax_rate_pct=Decimal("12"))
        assert r["base"] == Decimal("90.00")
        assert r["tax_amount"] == Decimal("10.80")

    def test_exempt_line(self):
        r = compute_line(quantity=Decimal("3"), unit_price_net=Decimal("20"), tax_rate_pct=None)
        assert r["tax_amount"] == Decimal("0.00")
        assert r["total"] == Decimal("60.00")

    def test_negative_price_rejected(self):
        with pytest.raises(BusinessRuleError):
            compute_line(quantity=Decimal("1"), unit_price_net=Decimal("-1"), tax_rate_pct=None)

    def test_discount_over_gross_rejected(self):
        with pytest.raises(BusinessRuleError):
            compute_line(quantity=Decimal("1"), unit_price_net=Decimal("10"),
                         discount_amount=Decimal("11"), tax_rate_pct=None)

    def test_merge_totals_exact(self):
        lines = [
            compute_line(quantity=Decimal("1"), unit_price_net=Decimal("0.01"), tax_rate_pct=Decimal("12")),
            compute_line(quantity=Decimal("999"), unit_price_net=Decimal("0.01"), tax_rate_pct=Decimal("12")),
        ]
        t = merge_totals(lines)
        assert Decimal(t["base_total"]) == Decimal("10.00")
        assert Decimal(t["tax_total"]) == Decimal("1.20")
        assert Decimal(t["grand_total"]) == Decimal("11.20")
        assert t["tax_breakdown"]["12"]["tax"] == "1.20"


class TestPermissionPatterns:
    def test_exact_and_glob(self):
        assert pattern_matches("catalogo.productos.leer", "catalogo.productos.leer")
        assert pattern_matches("catalogo.*", "catalogo.productos.crear")
        assert not pattern_matches("catalogo.productos.*", "catalogo.productos")
        assert not pattern_matches("compras", "compras.ordenes.crear")

    def test_prefix_collision_guard(self):
        assert not pattern_matches("compras", "comprasFoo.leer")

    def test_super_glob(self):
        assert has_permission(["*"], "cualquier.cosa")
