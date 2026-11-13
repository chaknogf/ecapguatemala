from __future__ import annotations

import threading
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.modules.catalog.models import Product
from app.modules.inventory import service as inv
from app.modules.inventory.models import LotStatus, MovementType, StockItem, StockMovementLine
from app.modules.tenancy.models import Warehouse
from tests.conftest import (
    TEST_DB_URL,
    TestingSession,
    login_headers,
    make_branch,
    make_company,
    make_user,
    new_product,
)


def _item(session, company_id, product_id, warehouse_id=None, lot_id=None):
    stmt = select(StockItem).where(StockItem.company_id == company_id, StockItem.product_id == product_id)
    if warehouse_id:
        stmt = stmt.where(StockItem.warehouse_id == warehouse_id)
    if lot_id:
        stmt = stmt.where(StockItem.lot_id == lot_id)
    rows = session.execute(stmt).scalars().all()
    return rows[0] if len(rows) == 1 else rows


def _mv(session, company, mtype, lines, wh=None, actor=None, **kw):
    return inv.apply_movement(
        session,
        company=company,
        movement_type=mtype,
        lines=lines,
        actor_id=actor or uuid.uuid4(),
        warehouse_id=kw.pop("warehouse_id", None) or (wh.id if wh else None),
        **kw,
    )


class TestReceiptsAndSalidas:
    def test_receipt_creates_stock_and_avg_cost(self, session):
        company = make_company(session)
        branch, wh = make_branch(session, company)
        actor = make_user(session, company)
        p = new_product(session, company, wh, purchase_cost=10)

        inv.apply_movement(
            session, company=company, movement_type=MovementType.RECEIPT,
            lines=[inv.LineCommand(p.id, Decimal("100"), warehouse_id=wh.id, unit_cost=Decimal("10"))],
            actor_id=actor.id, warehouse_id=wh.id, reference_document="OC-001",
        )
        item = _item(session, company.id, p.id)
        assert item.on_hand_qty == Decimal("100")
        assert item.unit_cost == Decimal("10")
        assert item.reserved_qty == Decimal("0")

    def test_weighted_average_recalculation(self, session):
        company = make_company(session)
        branch, wh = make_branch(session, company)
        actor = make_user(session, company)
        p = new_product(session, company, wh)

        inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                           lines=[inv.LineCommand(p.id, 100, warehouse_id=wh.id, unit_cost=10)],
                           actor_id=actor.id, warehouse_id=wh.id)
        inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                           lines=[inv.LineCommand(p.id, 100, warehouse_id=wh.id, unit_cost=20)],
                           actor_id=actor.id, warehouse_id=wh.id)
        item = _item(session, company.id, p.id)
        assert item.on_hand_qty == Decimal("200")
        assert item.unit_cost == Decimal("15")

    def test_sale_reduces_stock_and_freezes_cost(self, session):
        company = make_company(session)
        branch, wh = make_branch(session, company)
        actor = make_user(session, company)
        p = new_product(session, company, wh)
        inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                           lines=[inv.LineCommand(p.id, 10, warehouse_id=wh.id, unit_cost=10)],
                           actor_id=actor.id, warehouse_id=wh.id)
        m = inv.apply_movement(session, company=company, movement_type=MovementType.SALE,
                               lines=[inv.LineCommand(p.id, 4, warehouse_id=wh.id)],
                               actor_id=actor.id, warehouse_id=wh.id, reference_document="V-9")
        line = m.lines[0]
        assert line.quantity == Decimal("-4")
        assert line.unit_cost == Decimal("10")
        item = _item(session, company.id, p.id)
        assert item.on_hand_qty == Decimal("6")

    def test_sale_beyond_stock_rejected(self, session):
        company = make_company(session)
        branch, wh = make_branch(session, company)
        actor = make_user(session, company)
        p = new_product(session, company, wh)
        inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                           lines=[inv.LineCommand(p.id, 5, warehouse_id=wh.id, unit_cost=10)],
                           actor_id=actor.id, warehouse_id=wh.id)
        session.commit()
        from app.core.errors import InsufficientStockError

        with pytest.raises(InsufficientStockError):
            inv.apply_movement(session, company=company, movement_type=MovementType.SALE,
                               lines=[inv.LineCommand(p.id, 6, warehouse_id=wh.id)],
                               actor_id=actor.id, warehouse_id=wh.id)
        session.rollback()
        item = _item(session, company.id, p.id)
        assert item.on_hand_qty == Decimal("5")


class TestConcurrency:
    def test_two_concurrent_sales_only_one_wins(self, session):
        """§26.11: ventas concurrentes contra existencias limitadas."""
        company = make_company(session)
        branch, wh = make_branch(session, company)
        actor = make_user(session, company)
        p = new_product(session, company, wh)
        inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                           lines=[inv.LineCommand(p.id, 1, warehouse_id=wh.id, unit_cost=10)],
                           actor_id=actor.id, warehouse_id=wh.id)
        session.commit()

        results: list[str] = []

        def attempt(tag: str):
            s = TestingSession()
            try:
                comp = s.get(type(company), company.id)
                inv.apply_movement(
                    s, company=comp, movement_type=MovementType.SALE,
                    lines=[inv.LineCommand(p.id, 1, warehouse_id=wh.id)],
                    actor_id=actor.id, warehouse_id=wh.id,
                    idempotency_key=f"conc-{tag}",
                )
                s.commit()
                results.append(f"ok-{tag}")
            except Exception:
                s.rollback()
                results.append(f"fail-{tag}")
            finally:
                s.close()

        t1 = threading.Thread(target=attempt, args=("A",))
        t2 = threading.Thread(target=attempt, args=("B",))
        t1.start(); t2.start(); t1.join(); t2.join()
        assert sorted(results) == ["fail-A", "ok-B"] or sorted(results) == ["fail-B", "ok-A"]

        item = _item(session, company.id, p.id)
        assert item.on_hand_qty == Decimal("0")


class TestTransferencias:
    def test_transfer_atomic_moves_stock(self, session):
        company = make_company(session)
        branch, wh1 = make_branch(session, company)
        wh2 = Warehouse(company_id=company.id, branch_id=branch.id, code="ALM-02", name="Otra bodega")
        session.add(wh2)
        session.flush()
        actor = make_user(session, company)
        p = new_product(session, company, wh1)
        inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                           lines=[inv.LineCommand(p.id, 10, warehouse_id=wh1.id, unit_cost=10)],
                           actor_id=actor.id, warehouse_id=wh1.id)
        mv = inv.apply_transfer(
            session, company=company,
            lines=[inv.LineCommand(p.id, 4)],
            from_warehouse_id=wh1.id, to_warehouse_id=wh2.id, actor_id=actor.id,
        )
        assert len(mv.lines) == 2
        assert {l.warehouse_id for l in mv.lines} == {wh1.id, wh2.id}
        qty = {(l.warehouse_id, str(l.quantity)) for l in mv.lines}
        assert (wh1.id, "-4.0000") in qty and (wh2.id, "4.0000") in qty
        by_wh = {i.warehouse_id: i.on_hand_qty for i in session.execute(
            select(StockItem).where(StockItem.company_id == company.id,
                                    StockItem.product_id == p.id)).scalars()}
        assert by_wh[wh1.id] == Decimal("6")
        assert by_wh[wh2.id] == Decimal("4")

    def test_transfer_beyond_stock_rejected(self, session):
        company = make_company(session)
        branch, wh1 = make_branch(session, company)
        wh2 = Warehouse(company_id=company.id, branch_id=branch.id, code="ALM-02", name="B")
        session.add(wh2)
        session.flush()
        actor = make_user(session, company)
        p = new_product(session, company, wh1)
        inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                           lines=[inv.LineCommand(p.id, 3, warehouse_id=wh1.id, unit_cost=10)],
                           actor_id=actor.id, warehouse_id=wh1.id)
        from app.core.errors import InsufficientStockError

        with pytest.raises(InsufficientStockError):
            inv.apply_transfer(session, company=company,
                               lines=[inv.LineCommand(p.id, 5)],
                               from_warehouse_id=wh1.id, to_warehouse_id=wh2.id,
                               actor_id=actor.id)
        session.rollback()


class TestLotes:
    def _pharma(self, session):
        company = make_company(session)
        branch, wh = make_branch(session, company)
        actor = make_user(session, company)
        p = new_product(session, company, wh, track_lots=True, track_expiry=True)
        return company, wh, actor, p

    def test_sale_without_lot_rejected(self, session):
        company, wh, actor, p = self._pharma(session)
        from app.core.errors import BusinessRuleError

        with pytest.raises(BusinessRuleError):
            inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                               lines=[inv.LineCommand(p.id, 10, warehouse_id=wh.id, unit_cost=5)],
                               actor_id=actor.id, warehouse_id=wh.id)
        session.rollback()

    def test_expired_lot_blocked_for_sale(self, session):
        company, wh, actor, p = self._pharma(session)
        lot = inv.get_or_create_lot(
            session, company=company, product=p, lot_number="L-VENC",
            expiry_date=date.today() - timedelta(days=1), acquisition_cost=Decimal("5"),
        )
        inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                           lines=[inv.LineCommand(p.id, 10, warehouse_id=wh.id, lot_id=lot.id, unit_cost=5)],
                           actor_id=actor.id, warehouse_id=wh.id)
        session.commit()
        assert lot.status == LotStatus.EXPIRED

        from app.core.errors import ExpiredLotError

        with pytest.raises(ExpiredLotError):
            inv.apply_movement(session, company=company, movement_type=MovementType.SALE,
                               lines=[inv.LineCommand(p.id, 1, warehouse_id=wh.id, lot_id=lot.id)],
                               actor_id=actor.id, warehouse_id=wh.id)
        session.rollback()

    def test_fefo_allocation_prefers_sooner_expiry(self, session):
        company, wh, actor, p = self._pharma(session)
        lot_far = inv.get_or_create_lot(
            session, company=company, product=p, lot_number="L-FAR",
            expiry_date=date.today() + timedelta(days=200), acquisition_cost=Decimal("5"),
        )
        lot_near = inv.get_or_create_lot(
            session, company=company, product=p, lot_number="L-NEAR",
            expiry_date=date.today() + timedelta(days=20), acquisition_cost=Decimal("5"),
        )
        for lot, qty in ((lot_far, 10), (lot_near, 4)):
            inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                               lines=[inv.LineCommand(p.id, qty, warehouse_id=wh.id, lot_id=lot.id, unit_cost=5)],
                               actor_id=actor.id, warehouse_id=wh.id)
        session.flush()
        alloc = inv.fefo_allocation(
            session, company=company, product=p, variant_id=None,
            warehouse_id=wh.id, quantity=Decimal("6"),
        )
        alloc_map = dict(alloc)
        assert alloc_map[lot_near.id] == Decimal("4")
        assert alloc_map[lot_far.id] == Decimal("2")
        assert alloc[0][0] == lot_near.id

    def test_blocked_lot_rejected(self, session):
        company, wh, actor, p = self._pharma(session)
        lot = inv.get_or_create_lot(
            session, company=company, product=p, lot_number="L-BLOCK",
            expiry_date=date.today() + timedelta(days=100), acquisition_cost=Decimal("5"),
        )
        inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                           lines=[inv.LineCommand(p.id, 10, warehouse_id=wh.id, lot_id=lot.id, unit_cost=5)],
                           actor_id=actor.id, warehouse_id=wh.id)
        lot.status = LotStatus.BLOCKED
        session.flush()
        from app.core.errors import BusinessRuleError

        with pytest.raises(BusinessRuleError):
            inv.apply_movement(session, company=company, movement_type=MovementType.SALE,
                               lines=[inv.LineCommand(p.id, 2, warehouse_id=wh.id, lot_id=lot.id)],
                               actor_id=actor.id, warehouse_id=wh.id)

    def test_company_policy_may_permit_expired_sale_when_not_blocked(self, session):
        """Con block_sale_expired_lots=False la excepción es explícita y auditable por política."""
        company = make_company(session, policy={"block_sale_expired_lots": False})
        branch, wh = make_branch(session, company)
        actor = make_user(session, company)
        p = new_product(session, company, wh, track_lots=True, track_expiry=True)
        lot = inv.get_or_create_lot(
            session, company=company, product=p, lot_number="L-OK",
            expiry_date=date.today() - timedelta(days=5), acquisition_cost=Decimal("5"),
        )
        lot.status = LotStatus.ACTIVE
        session.flush()
        inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                           lines=[inv.LineCommand(p.id, 4, warehouse_id=wh.id, lot_id=lot.id, unit_cost=5)],
                           actor_id=actor.id, warehouse_id=wh.id)
        m = inv.apply_movement(session, company=company, movement_type=MovementType.SALE,
                               lines=[inv.LineCommand(p.id, 1, warehouse_id=wh.id, lot_id=lot.id)],
                               actor_id=actor.id, warehouse_id=wh.id)
        assert m.lines[0].quantity == Decimal("-1")


class TestReservas:
    def test_reservation_document_blocks_overdraw(self, session):
        company = make_company(session)
        branch, wh = make_branch(session, company)
        actor = make_user(session, company)
        p = new_product(session, company, wh)
        inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                           lines=[inv.LineCommand(p.id, 10, warehouse_id=wh.id, unit_cost=10)],
                           actor_id=actor.id, warehouse_id=wh.id)
        session.commit()
        doc_id = uuid.uuid4()
        inv.reserve_document(
            session, company=company, doc_type="test_order", doc_id=doc_id,
            lines=[inv.LineCommand(p.id, 4, warehouse_id=wh.id)],
        )
        session.commit()
        item = _item(session, company.id, p.id)
        assert item.reserved_qty == Decimal("4")
        assert item.on_hand_qty == Decimal("10")  # la reserva no altera el físico

        from app.core.errors import InsufficientStockError

        with pytest.raises(InsufficientStockError):
            inv.apply_movement(session, company=company, movement_type=MovementType.SALE,
                               lines=[inv.LineCommand(p.id, 7, warehouse_id=wh.id)],
                               actor_id=actor.id, warehouse_id=wh.id)
        session.rollback()
        inv.release_reservations(session, company=company, doc_type="test_order", doc_id=doc_id)
        item = _item(session, company.id, p.id)
        assert item.reserved_qty == Decimal("0")

    def test_consume_reservations_frees_exact_quantity(self, session):
        company = make_company(session)
        branch, wh = make_branch(session, company)
        actor = make_user(session, company)
        p = new_product(session, company, wh)
        inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                           lines=[inv.LineCommand(p.id, 10, warehouse_id=wh.id, unit_cost=10)],
                           actor_id=actor.id, warehouse_id=wh.id)
        doc_id = uuid.uuid4()
        inv.reserve_document(
            session, company=company, doc_type="test_order", doc_id=doc_id,
            lines=[inv.LineCommand(p.id, 6, warehouse_id=wh.id)],
        )
        inv.consume_reservations(
            session, company=company, doc_type="test_order", doc_id=doc_id,
            movements_by_line=[(p.id, None, wh.id, Decimal("6"))],
        )
        item = _item(session, company.id, p.id)
        assert item.reserved_qty == Decimal("0")


class TestReversos:
    def test_reverse_receipt_reduces_stock(self, session):
        company = make_company(session)
        branch, wh = make_branch(session, company)
        actor = make_user(session, company)
        p = new_product(session, company, wh)
        m = inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                               lines=[inv.LineCommand(p.id, 10, warehouse_id=wh.id, unit_cost=10)],
                               actor_id=actor.id, warehouse_id=wh.id, reference_document="OC-5")
        orig = m.lines[0]
        rev = inv.reverse_line(session, company=company, line_id=orig.id,
                               actor_id=actor.id, reason="Error de digitación: cantidad duplicada")
        assert rev.quantity == Decimal("-10")
        assert rev.reverses_line_id == orig.id
        item = _item(session, company.id, p.id)
        assert item.on_hand_qty == Decimal("0")
        # original intacto (inmutabilidad)
        session.refresh(orig)
        assert orig.quantity == Decimal("10")

        from app.core.errors import ConflictError

        with pytest.raises(ConflictError):
            inv.reverse_line(session, company=company, line_id=orig.id,
                             actor_id=actor.id, reason="Otra vez")

    def test_reverse_sale_blocked_if_consumed(self, session):
        company = make_company(session)
        branch, wh = make_branch(session, company)
        actor = make_user(session, company)
        p = new_product(session, company, wh)
        m = inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                               lines=[inv.LineCommand(p.id, 5, warehouse_id=wh.id, unit_cost=10)],
                               actor_id=actor.id, warehouse_id=wh.id)
        inv.apply_movement(session, company=company, movement_type=MovementType.SALE,
                           lines=[inv.LineCommand(p.id, 5, warehouse_id=wh.id)],
                           actor_id=actor.id, warehouse_id=wh.id)
        from app.core.errors import InsufficientStockError

        with pytest.raises(InsufficientStockError):
            inv.reverse_line(session, company=company, line_id=m.lines[0].id,
                             actor_id=actor.id, reason="Revertir recepción ya vendida")


class TestIdempotencia:
    def test_same_idempotency_key_returns_same_document(self, session):
        company = make_company(session)
        branch, wh = make_branch(session, company)
        actor = make_user(session, company)
        p = new_product(session, company, wh)
        key = uuid.uuid4().hex
        m1 = inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                                lines=[inv.LineCommand(p.id, 10, warehouse_id=wh.id, unit_cost=10)],
                                actor_id=actor.id, warehouse_id=wh.id, idempotency_key=key)
        session.commit()
        m2 = inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                                lines=[inv.LineCommand(p.id, 10, warehouse_id=wh.id, unit_cost=10)],
                                actor_id=actor.id, warehouse_id=wh.id, idempotency_key=key)
        assert m1.id == m2.id
        qty = session.execute(
            select(StockItem.on_hand_qty).where(StockItem.company_id == company.id,
                                                StockItem.product_id == p.id)
        ).scalars().all()
        assert qty == [Decimal("10")]


class TestSemáforos:
    def test_stock_light(self, session):
        company = make_company(session)
        branch, wh = make_branch(session, company)
        p = new_product(session, company, wh, min_stock=10, max_stock=100, reorder_point=15)
        assert inv.stock_traffic_light(Decimal("50"), Decimal("0"), p) == "normal"
        assert inv.stock_traffic_light(Decimal("12"), Decimal("0"), p) in ("low", "reorder", "min_reached")
        assert inv.stock_traffic_light(Decimal("8"), Decimal("0"), p) == "min_reached"
        assert inv.stock_traffic_light(Decimal("0"), Decimal("0"), p) == "out"
        assert inv.stock_traffic_light(Decimal("50"), Decimal("45"), p) == "min_reached"

    def test_expiry_light(self):
        today = date.today()
        assert inv.expiry_traffic_light(None, 90, 30) == "gray"
        assert inv.expiry_traffic_light(today + timedelta(days=100), 90, 30) == "green"
        assert inv.expiry_traffic_light(today + timedelta(days=60), 90, 30) == "yellow"
        assert inv.expiry_traffic_light(today + timedelta(days=10), 90, 30) == "red"
        assert inv.expiry_traffic_light(today - timedelta(days=1), 90, 30) == "black"


class TestConciliacion:
    def test_reconcile_detects_tampering(self, session):
        company = make_company(session)
        branch, wh = make_branch(session, company)
        actor = make_user(session, company)
        p = new_product(session, company, wh)
        inv.apply_movement(session, company=company, movement_type=MovementType.RECEIPT,
                           lines=[inv.LineCommand(p.id, 10, warehouse_id=wh.id, unit_cost=10)],
                           actor_id=actor.id, warehouse_id=wh.id)
        assert inv.reconcile_stock(session, company.id) == []
        item = _item(session, company.id, p.id)
        item.on_hand_qty = Decimal("7")  # manipulación fuera del flujo
        session.flush()
        diffs = inv.reconcile_stock(session, company.id)
        assert len(diffs) == 1
        assert Decimal(diffs[0]["difference"]) == Decimal("-3")
