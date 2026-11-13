# Arquitectura objetivo (Fase 2)

Documento de decisiones. Refleja la arquitectura **implementada** en `backend/` y el plan veraz para lo pendiente. No documenta como existente lo que no existe.

## 1. Decisiones fundamentales

| AD | Decisión | Motivo |
|----|----------|--------|
| AD-1 | Repositorio monorepo: `backend/` (FastAPI+PostgreSQL) convive con el frontend Angular y el legado Hono/Vercel congelado | Conserva el despliegue existente operativo (regla: no eliminar funcionalidad sin documentar impacto); el núcleo nuevo no contamina el viejo |
| AD-2 | PostgreSQL 18 + SQLAlchemy 2.x **síncrono** + Alembic | psycopg3 soporta el modo sync establemente; simplifica transacciones y `SELECT … FOR UPDATE` en servicios de dominio sin cambiar a async en todo el catálogo; FastAPI lo ejecuta en threadpool. Reversible a async sin tocar capas de dominio |
| AD-3 | Claves primarias `UUIDv7` (time-ordered) en todas las entidades | Ordenación temporal sin contention de secuencias; portabilidad de la lógica a sharding futuro |
| AD-4 | Dinero y cantidades: `Numeric` en BD, `Decimal` en Python; jamás float | Requisito §4 del pliego |
| AD-5 | Saldo de inventario **materializado y reconciliable**: `stock_item.on_hand_qty` es la única fuente de verdad operativa, modificada **exclusivamente** dentro de la misma transacción SQL que inserta `stock_movement_line` (con `FOR UPDATE`) | Dos fuentes de verdad sin reconciliación violan §25; una sin trazabilidad viola §8. Esta combinación da lectura O(1) con auditoría completa; `scripts/reconcile_stock.py` verifica invariante `on_hand = Σ signos(líneas confirmadas)` por (producto,bodega,lote) |
| AD-6 | Movimientos confirmados inmutables: sin UPDATE ni DELETE; corrección = `REVERSO` con `reverses_line_id` | Requisito §8/§25; elimina el `DELETE /documents` del legado (F7) |
| AD-7 | No-negativo de existencias impuesto en la **base de datos** (`CHECK on_hand_qty >= 0` por defecto; la política de empresa puede relajarlo en la capa de servicio, nunca el CHECK estructural del modo estricto) + bloqueo de fila | F8: la concurrencia se resuelve en PostgreSQL, no en la app; una segunda solicitud obtiene 409, no sobreventa |
| AD-8 | Reservas como columna separada (`reserved_qty`) con `CHECK (on_hand_qty - reserved_qty >= 0)` | Disponible = físico − reservado (§8); las alertas y el despacho usan disponible, el kardex usa físico |
| AD-9 | Autorización multi-empresa en backend: el JWT lleva `company_id` y patrones de permiso; **ningún endpoint acepta empresa como parámetro de cliente** para acotar datos — el filtro se deriva del token | Requisito §5: "no confíes en el identificador de empresa enviado por el frontend" |
| AD-10 | RBAC por patrones de permiso (`modulo.accion[.*]`) con roles asignados por empresa; verificación en backend; el frontend solo oculta UI | Matriz §15; roles configurables; patrón glob permite delegación sin tabla infinita |
| AD-11 | Autenticación: Argon2id + access JWT HS256 corto (15 min) + refresh token opaco de un solo uso con rotación y tabla de revocación; bloqueo por intentos fallidos (5/15 min) | §19; reemplaza el HS256 de 7 días con secreto hardcodeado (F3) |
| AD-12 | Impuestos como entidades por empresa con tasa `Numeric(9,4)`, vigencia histórica y tratamiento gravado/exento por producto; la línea de documento congela tasa y base | §12; sin suponer IVA uniforme |
| AD-13 | Valoración de inventario: promedio ponderado por (producto,bodega[,lote)] actualizada atómicamente en cada recepción; FIFO por lote disponible vía FEFO/FIFO; el costo unitario aplicado se **congela en la línea de movimiento** | §14: diferencia valoración de reconocimiento contable; costo de ventas auditable |
| AD-14 | Semáforos (vencimiento y existencias) como política por empresa (`expiry_warn_days`, `expiry_critical_days`, umbrales por producto) calculados en backend, no hardcodeados en UI | §8; intervalos configurables, ejemplos del pliego no son reglas |
| AD-15 | Migración de datos del legado: script `legacy/` (Fase 9) lee `server/data/app.db` y crea empresa + almacén + productos + movimientos de apertura. No se ejecuta hasta validar esquema destino | §29: no migrar sin evaluación |
| AD-16 | Facturación fiscal FEL (Guatemala): **no implementada**. El módulo `facturacion` emite documentos comerciales numerados; la integración legal queda como adaptador desacoplado pendiente de verificación normativa profesional | §11: no inventar certificaciones |
| AD-17 | Contabilidad: módulo en Fase 6; esquema de tablas contables reservado en diseño, migración incluida cuando se implemente. El pliego prohíbe presentar estados financieros sin plan de cuentas configurado: mientras no exista, el API devuelve "no configurado", nunca cifras inventadas | §14 |

## 2. Límites de módulo (backend)

```
backend/app/
  core/            # config (pydantic-settings), db, seguridad, errores, dependencias, auditoría
  modules/
    identity/      # usuarios, sesiones, roles/permisos   → /api/v1/auth, /api/v1/users, /api/v1/roles
    tenancy/       # empresas, sucursales, bodegas         → /api/v1/companies, /branches, /warehouses
    catalog/       # unidades, categorías, marcas, productos, variantes, atributos EAV → /api/v1/units,categories,products,variants
    inventory/     # existencias, movimientos, lotes, reservas, kardex, alertas → /api/v1/stock,movements,lots
    purchases/     # Fase 5   proveedores→solicitud→OC→recepción(entrada)→nota crédito
    sales/         # Fase 5   clientes→cotización→pedido(reserva)→despacho(salida)→factura comercial→cobro
    fiscal/        # Fase 6   impuestos (modelo ya), numeración documental, adaptador FEL (pendiente)
    accounting/    # Fase 6   plan de cuentas, diario, mayor, estados
    reporting/     # Fase 6/7 dashboard KPIs reales
  bootstrap.py     # creación segura del primer administrador (CLI, sin secretos versionados)
```

Reglas entre módulos: un módulo solo escribe en sus tablas; la interacción es por servicios de dominio dentro de una misma sesión/transacción. `inventory` es el guardián del stock: compras/ventas **le piden** movimientos confirmados; nadie escribe `on_hand_qty` fuera de `inventory/service.py`.

## 3. Modelo de datos núcleo (migración 0001)

- `company`: datos fiscales/operativos, moneda (ISO 4217), zona horaria IANA, políticas JSONB de inventario/semáforos, capacidades habilitadas.
- `branch`, `warehouse` (bodega por sucursal, política de negativo own).
- `user` (credenciales Argon2id, `must_change_password`), `role` (patterns de permiso), `user_role` por empresa, `refresh_session` (hash del token, rotación, revocación), `login_attempt`.
- `audit_log`: actor, empresa/sucursal, entidad, acción, valores anterior/nuevo (sanitizados; nunca contraseñas/tokens), resultado, ip.
- Catálogo: `unit` + `product_unit` (uso compra/venta/stock + factor), `product_category`, `brand`, `product` (tipo: finished/raw/service/package/kit; banderas lot/serial/vencimiento; método valoración; umbrales stock; atributos personalizados JSONB validados contra `product_attribute_def`), `variant_attr`/`variant_attr_value`/`product_variant` (SKU y barcode propios), `product_barcode` (multi-código), `product_tax` (imágenes vía storage local, fuera de BD).
- Inventario: `stock_item` (producto[+variante]×bodega[×lote] con on_hand, reserved, costo promedio; checks de integridad; índices únicos), `stock_lot` (número, vencimiento, estado, costo recepción), `stock_movement` (documento: tipo entrada/salida/transferencia/ajuste/inventario físico/reverso; referencia al documento origen; idempotency key única por empresa) + `stock_movement_line` (signo, cantidad, lote, costo congelado, `reverses_line_id`).

Convenciones: snake_case plural, FK con nombre, `created_at/updated_at` con timezone, borrado lógico por `status` en maestros (nunca cascade en movimientos), `CHECK` de dominio siempre.

## 4. Flujos críticos garantizados

- **Recepción de compra** → `MOVEMENT(type=RECEIPT)` solo al confirmar recepción (la OC no afecta stock).
- **Despacho de venta** → bloqueo `FOR UPDATE` de filas afectadas, verificación de lote vencido contra política, reserva liberada en la misma transacción.
- **Transferencia** → dos líneas en un documento (salida bodega A / entrada bodega B) atómicas.
- **Ajuste** → tipo AJUSTE con motivo obligatorio y permiso de aprobación separado.
- **Idempotencia** → `Idempotency-Key` por empresa en documentos sensibles; duplicado = re-entrega del documento existente.

## 5. Despliegue objetivo

Contenedores (Podman preferente, Docker compatible): `db` (PostgreSQL 18, volumen persistente, sin puerto público por defecto), `api` (uvicorn, solo red interna), `web` (nginx sirviendo dist Angular + proxy inverso a `/api/v1` → api), opcional `caddy` / `cloudflare-tunnel` según modo del instalador. Secretos generados en `install` (`.env` local, 0600 / ACL Windows), nunca en Git. Script de administración `synvapp.ps1` / `synvapp.sh` con verbos install/start/stop/status/logs/update/backup/restore/diagnose/configure/uninstall.

**Honestidad de validación**: este entorno de desarrollo (macOS, sin Podman/Docker) permite ejecutar y probar API+PostgreSQL+frontend de forma nativa; los instaladores se entregan implementados y **marcados como pendientes de validación en Windows y Linux**, sin afirmar compatibilidad no probada (§29).

## 6. Fases restantes y estado

| Fase | Contenido | Estado |
|------|-----------|--------|
| 1 Diagnóstico | docs/DIAGNOSTICO.md | ✅ |
| 2 Arquitectura | este documento | ✅ |
| 3 Base backend | core, seguridad, multiempresa, RBAC, auditoría, bootstrap | ✅ (75 pytest sobre esquema migrado) |
| 4 Núcleo inventario | catálogo, variantes, bodegas, lotes, movimientos, Kardex, semáforos | ✅ (código+pruebas) |
| 5 Compras/ventas/CRM | proveedores, OC con aprobación separada, recepciones parciales, clientes, pedidos con reserva FEFO, despacho transaccional, factura comercial con snapshot, cobros parciales, CxC, dashboard real, numeración documental | ✅ (pruebas e2e de ciclo completo). Cotizaciones y notas de crédito operativas pendientes |
| 6 Finanzas/contabilidad | motor de impuestos operativo (línea congela tasa/base); CxC operativo; caja, CxP y partida doble pendientes | ⚠️ parcial |
| 7 Frontend | `/v1/*`: login multi-empresa, shell por permisos, panel, catálogo, inventario, movimientos+FEFO+kardex+reversos, compras, ventas (pedido→despacho→factura→cobro), clientes, usuarios, config, auditoría | ✅ inicial; variantes/cotizaciones/caja/contabilidad pendientes |
| 8 Instalador | compose podman/docker + scripts por SO | ⚠️ entregado, **no validado en Windows/Linux** |
| 9 Validación | 77 pytest + 64 vitest + build Angular en verde; smoke HTTP de flujo real (detectó y corrigió bug select-company) | ✅ en lo entregado |
