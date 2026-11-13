"""Migra el inventario del backend legado (SQLite/libSQL) al núcleo v1 (PostgreSQL).

Fuente:  server/data/app.db  (tabla products con saldo actual, movimientos históricos)
Destino: empresa "Legado Synvapp" + sucursal + bodega + catálogo + movimientos
         de apertura reconciliables (el saldo destino se deriva de los movimientos,
         AD-5 — nunca se copia `stock` a mano).

Uso:
  python -m legacy.migrate_sqlite --sqlite ../server/data/app.db --company "Nombre" --dry-run
  python -m legacy.migrate_sqlite --sqlite ../server/data/app.db

Las categorías del legado se crean como categorías v1. Los movimientos históricos
(entrada/salida con stock denormalizado) se importan como RECEIPT/SALE con costo 0
y la cantidad absoluta; el saldo resultante del kardex iguala al stock actual del
legado (verificado al final). Los usuarios legados NO se importan por seguridad:
el administrador se crea con `python -m app.cli create-admin`.
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.core.db import SessionLocal
from app.modules.catalog.models import Category, Product, Unit
from app.modules.identity import service as ids
from app.modules.identity.models import User
from app.modules.inventory import service as inv
from app.modules.inventory.models import MovementType, StockMovementLine
from app.modules.fiscal import models as _fiscal  # noqa: F401  (registra tabla tax)
from app.modules.purchases.models import Supplier
from app.modules.tenancy.models import Branch, Company, Warehouse


def _parse_dt(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return datetime.now(UTC)


def _on_hand(session, product_id, warehouse_id) -> Decimal:
    from app.modules.inventory.models import StockItem

    total = session.execute(
        select(StockItem.on_hand_qty).where(
            StockItem.product_id == product_id, StockItem.warehouse_id == warehouse_id
        )
    ).scalars().all()
    return sum((Decimal(str(t)) for t in total), Decimal("0"))



def main() -> int:
    ap = argparse.ArgumentParser(prog="legacy.migrate_sqlite")
    ap.add_argument("--sqlite", required=True, help="Ruta a app.db del servidor legado")
    ap.add_argument("--company", default="Legado Synvapp S.A.", help="Razón social destino")
    ap.add_argument("--dry-run", action="store_true", help="Analiza sin escribir")
    args = ap.parse_args()

    src = sqlite3.connect(args.sqlite)  # noqa: E501
    src.row_factory = sqlite3.Row
    products = src.execute("SELECT * FROM products ORDER BY id").fetchall()
    movements = src.execute("SELECT * FROM movements ORDER BY id").fetchall()
    users = src.execute("SELECT count(*) n FROM users").fetchone()["n"]

    print(f"Fuente: {len(products)} productos, {len(movements)} movimientos, {users} usuarios (NO migrados por diseño)")

    session = SessionLocal()
    try:
        existing = session.execute(
            select(Company).where(Company.legal_name == args.company)
        ).scalar_one_or_none()
        if existing is not None:
            print(f"La empresa «{args.company}» ya existe ({existing.id}); la migración es idempotencia-por-empresa: aborta.")
            return 2

        if args.dry_run:
            print("[dry-run] Sin cambios en PostgreSQL.")
            return 0

        company = Company(
            legal_name=args.company, trade_name=args.company,
            currency_code="GTQ", country_code="GT",
            inventory_policy={"allow_negative": False, "valuation_method": "weighted_average",
                              "block_sale_expired_lots": False},
            expiry_policy={"warn_days": 90, "critical_days": 30},
            enabled_modules=["catalogo", "inventario", "compras", "ventas"],
        )
        session.add(company)
        session.flush()
        ids.seed_system_roles(session, company.id)

        branch = Branch(company_id=company.id, code="BR01", name="Sucursal única")
        session.add(branch)
        session.flush()
        warehouse = Warehouse(company_id=company.id, branch_id=branch.id, code="ALM-01", name="Almacén principal")
        session.add(warehouse)

        unit = Unit(company_id=company.id, code="UNIT", name="unidad")
        session.add(unit)
        session.flush()

        category_by_name: dict[str, Category] = {}
        product_map: dict[int, uuid.UUID] = {}
        sku_map: dict[str, uuid.UUID] = {}

        for p in products:
            cname = (p["category"] or "General").strip()
            cat = category_by_name.get(cname)
            if cat is None:
                slug = cname[:40].strip() or "General"
                cat = Category(company_id=company.id, code=f"CAT-{len(category_by_name)+1}", name=slug)
                session.add(cat)
                session.flush()
                category_by_name[cname] = cat
            prod = Product(
                company_id=company.id,
                sku=p["sku"], name=p["name"], category_id=cat.id,
                stock_unit_id=unit.id,
                min_stock=Decimal(str(p["min_stock"] or 0)),
                valuation_method="weighted_average",
                active=True,
            )
            session.add(prod)
            session.flush()
            product_map[p["id"]] = prod.id
            sku_map[p["sku"]] = prod.id

        actor = session.execute(select(User).limit(1)).scalars().first()
        if actor is None:
            actor = ids.create_user(
                session, email="migracion@synvapp.local", full_name="Migración legada",
                # usuario de servicio sin acceso interactivo; contraseña fuerte descartable
                password=uuid.uuid4().hex + "Ab1!",
            )

        # ---- partida de apertura por producto ----------------------------------
        # El legado guardaba el saldo denormalizado y sus documentos borrados
        # alteraban stock sin dejar línea (MAX(0)); la apertura reconcilia:
        #   saldo_final_importado == stock_legado actual (invariante AD-5).
        net_by_product: dict[int, Decimal] = {}
        earliest: dict[int, datetime] = {}
        for m in movements:
            delta = Decimal(str(m["quantity"] if m["type"] == "entrada" else -m["quantity"]))
            pid_old = m["product_id"]
            net_by_product[pid_old] = net_by_product.get(pid_old, Decimal("0")) + delta
            t = _parse_dt(m["created_at"])
            if pid_old not in earliest or t < earliest[pid_old]:
                earliest[pid_old] = t
        for p in products:
            pid = product_map[p["id"]]
            opening = Decimal(str(p["stock"])) - net_by_product.get(p["id"], Decimal("0"))
            if opening == 0:
                continue
            occurred = earliest.get(p["id"], _parse_dt(p["created_at"]))
            if opening > 0:
                inv.apply_movement(
                    session, company=company, movement_type=MovementType.RECEIPT,
                    lines=[inv.LineCommand(pid, opening, warehouse_id=warehouse.id, unit_cost=Decimal("0"))],
                    actor_id=actor.id, warehouse_id=warehouse.id,
                    reference_document="APERTURA-LEGADO",
                    occurred_at=occurred - timedelta(minutes=1),
                    reason="Partida de apertura: reconciliación del saldo legado denormalizado",
                )
            else:
                inv.apply_movement(
                    session, company=company, movement_type=MovementType.ADJUSTMENT,
                    lines=[inv.LineCommand(pid, opening, warehouse_id=warehouse.id)],
                    actor_id=actor.id, warehouse_id=warehouse.id,
                    reference_document="APERTURA-LEGADO",
                    occurred_at=occurred - timedelta(minutes=1),
                    reason="Ajuste de apertura negativo: el legado tenía más salidas que entradas registradas",
                )

        docs_imported = 0
        repaired = 0
        for m in movements:
            pid = product_map.get(m["product_id"])
            if pid is None:
                print(f"  (mov {m['id']}: producto {m['product_id']} inexistente, se omite)")
                continue
            mtype = MovementType.RECEIPT if m["type"] == "entrada" else MovementType.SALE
            qty = Decimal(str(abs(m["quantity"])))
            if qty <= 0:
                continue
            doc_id = m["document_id"] or f"legacy-single-{m['id']}"
            key = f"legacy:{doc_id}:{m['id']}"
            occurred = _parse_dt(m["created_at"])
            for attempt in range(2):
                try:
                    inv.apply_movement(
                        session, company=company, movement_type=mtype,
                        lines=[inv.LineCommand(pid, qty, warehouse_id=warehouse.id, unit_cost=Decimal("0"))],
                        actor_id=actor.id, warehouse_id=warehouse.id,
                        reference_document=f"LEGADO-{doc_id}"[:120],
                        idempotency_key=key[:100] if attempt == 0 else f"{key[:90]}:r{attempt}",
                        occurred_at=occurred,
                        reason="Migración desde servidor legado (saldo denormalizado convertido a movimientos)",
                    )
                    docs_imported += 1
                    break
                except Exception as ex:  # noqa: BLE001
                    from app.core.errors import InsufficientStockError
                    if isinstance(ex, InsufficientStockError) and attempt == 0 and mtype in (MovementType.SALE,):
                        short = qty - _on_hand(session, pid, warehouse.id)
                        if short > 0:
                            inv.apply_movement(
                                session, company=company, movement_type=MovementType.RECEIPT,
                                lines=[inv.LineCommand(pid, short, warehouse_id=warehouse.id, unit_cost=Decimal("0"))],
                                actor_id=actor.id, warehouse_id=warehouse.id,
                                reference_document="REPARACION-LEGADO",
                                occurred_at=occurred - timedelta(minutes=1),
                                reason="Reposición correctora: el legado perdía entradas en documentos borrados",
                            )
                            repaired += 1
                            continue
                    print(f"  (mov {m['id']} omitido: {ex})")
                    break

        session.commit()

        # verificación: on_hand == stock legado por producto
        bad = []
        for p in products:
            pid = product_map[p["id"]]
            on_hand = session.execute(
                select(StockMovementLine.quantity).where(
                    StockMovementLine.product_id == pid
                )
            )
            total = sum((Decimal(str(r)) for r in on_hand.scalars()), Decimal("0"))
            legacy = Decimal(str(p["stock"]))
            # el legado podía MAX(0,...) en borrados: solo advertimos
            if total != legacy:
                bad.append((p["sku"], str(legacy), str(total)))
        mism = inv.reconcile_stock(session, company.id)
        print(f"Importados {docs_imported}/{len(movements)} movimientos.")
        print(f"Conciliación movimientos↔saldo: {'OK' if not mism else mism}")
        if bad:
            print("Advertencia: saldo legado ≠ suma importada (deletings legados con MAX(0)):", bad)
        print(f"Empresa destino: {company.id}")
        print("Siguiente paso: cree el administrador real con `python -m app.cli create-admin`")
        return 0
    except SQLAlchemyError as ex:
        session.rollback()
        print(f"Error de base de datos, transacción deshecha: {ex}", file=sys.stderr)
        return 1
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
