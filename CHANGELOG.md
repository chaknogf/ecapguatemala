# CHANGELOG

## [0.1.0] — 2026-10-27 — Refactorización por fases (núcleo v1)

### Añadido — Fase 1/2 (auditoría y arquitectura)
- `docs/DIAGNOSTICO.md`: auditoría del proyecto legado (F1–F20, severidades,
  componentes conservados vs reemplazados).
- `ARQUITECTURA.md`: decisiones AD-1…AD-17, límites de módulo, modelo de datos,
  fases y estado veraz.

### Añadido — Fase 3 (base backend)
- `backend/`: FastAPI + SQLAlchemy 2 (sync, psycopg3) + Alembic + PostgreSQL.
- Seguridad: Argon2id; JWT acceso 15 min + refresh opaco con rotación,
  detección de reuso (revocación de familia), revocación en cambio de
  contraseña; bloqueo de intentos (5/15 min); arranque bloqueado en producción
  con secretos por defecto o DEBUG.
- Multiempresa derivada del token; roles sembrados por empresa (10);
  RBAC por patrones verificados en backend; usuarios nuevos con cambio de
  contraseña obligatorio.
- Auditoría comercial append-only con sanitización de secretos.
- CLI: `app.cli secret|create-admin|reconcile-stock`.

### Añadido — Fase 4 (catálogo + inventario)
- Unidades con conversiones, categorías jerárquicas, marcas, impuestos por
  empresa (tasa NUMERIC, vigencia), atributos EAV definidos por empresa y
  validados por tipo; productos (5 tipos) con variantes (SKU/barcode propios),
  códigos de barras múltiples y lookup único.
- Motor de márgenes/recargos/precio-sugerido (Decimal, divisiones por cero
  bloqueadas).
- Inventario: saldo materializado por (producto,variante,bodega,lote) con
  `FOR UPDATE` y concurrencia probada; movimientos inmutables con 12 tipos y
  reversos; reservas documentales por lote; FEFO; lotes con semáforos de
  vencimiento y políticas por empresa; transferencias atómicas; ajustes con
  motivo; kardex; conciliación; idempotencia.

### Añadido — Fase 5 (compras + ventas + dashboard)
- Proveedores, OC numeradas (`OC-…`), aprobación separada de la recepción,
  recepciones totales/parciales con lote/costo, sobre-recepción rechazada,
  gastos adicionales; nada de stock al crear/aprobar.
- Clientes (crédito, descuentos autorizados), vendedores (comisión), pedidos
  numerados, confirmación con reserva FEFO, despacho transaccional que consume
  reservas exactas, factura comercial con snapshot histórico y desglose de
  impuestos, límite de crédito enforced, pagos parciales con idempotencia,
  antigüedad de saldos.
- Dashboard con indicadores reales y método de cálculo documentado (ventas ≠
  cobros; sin cifras de contabilidad/CxP no existentes).
- Reservas `stock_reservation`, secuencias `document_sequence` con bloqueo.
- Migraciones Alembic 0001 (`b2220694cd72`) y 0002 (`fdea0bd02324`);
  downgrade→upgrade verificado; las pruebas corren sobre el esquema migrado.

### Añadido — Pruebas
- 77 pruebas pytest sobre PostgreSQL real (incluye unitarias de motor fiscal/permisos que
  detectaron y corrigieron un error de base imponible en precios con IVA incluido;
  authn/RBAC/aislamiento, catálogo,
  márgenes, inventario, concurrencia, lotes/FEFO, reservas, reversos,
  idempotencia, conciliación, ciclo completo compra→venta→cobro, dashboard).
- 64 pruebas vitest del frontend legado: siguen en verde (sin cambios).

### Añadido — Infraestructura
- `infra/compose.yml` (db sin puerto público, api solo loopback/interna, web
  opcional por perfil), `Dockerfile.api` (no-root, healthcheck, versiones
  fijadas), `Dockerfile.web`, `nginx.conf`.
- `scripts/synvapp.sh` y `scripts/synvapp.ps1` (install con modos
  local/lan/caddy/tunnel, start/stop/restart/status/logs/update/backup/restore/
  configure/diagnose/admin/uninstall; backups con pg_dump -Fc + checksum;
  restauraciones con confirmación explícita; datos conservados al desinstalar).
- `backend/legacy/migrate_sqlite.py`: migración verificada contra los datos
  legados (11/11 movimientos, saldos == legado, conciliación OK).

### Documentación
- README, AGENTS, docs/{DESARROLLO,INSTALACION,CONFIGURACION,RESPALDOS,
  ROLES-Y-PERMISOS,MODULOS,API}.md.

### Añadido — Fase 7 (UI Angular v1 sobre `/api/v1`, en la misma app)
- Núcleo `core/v1`: sesión (login, selección de empresa, refresh con rotación,
  revocación), espejo UI de `BUILTIN_ROLES` (solo oculta; la autoridad es el
  backend), guard de autenticación/cambio obligatorio de contraseña, interceptor
  401→refresh con reintento y cola de un solo refresh.
- Servicios tipados contra OpenAPI: catálogo, inventario, compras, ventas,
  plataforma (dashboard/config/usuarios/auditoría) — sin datos simulados.
- Pantallas `/v1/*`: login multi-empresa; shell con navegación por permisos,
  alertas y tema claro/oscuro (paleta Synvapp); dashboard con KPIs reales y
  onboarding de primera empresa; catálogo; inventario con semáforos y lotes por
  vencer; movimientos (entrada/salida/ajuste/transferencia, alta de lote,
  FEFO automático, kardex y reversos con motivo); compras (OC→aprobar→recepción
  parcial); ventas (pedido→confirmar→despacho→factura→cobro + CxC con
  antigüedad); clientes; usuarios/roles; configuración de empresa, políticas,
  sucursales/bodegas y maestros; auditoría con diff antes/después.
- `proxy.conf.json` enruta `/api/v1`→:8000 y `/api`→:1337 (legado intacto).

### Añadido — arranque de desarrollo en un solo comando
- `scripts/dev.sh` (Linux/macOS) y `scripts/dev.ps1` (Windows): crea/reutiliza
  `backend/.venv`, instala dependencias si faltan, genera `.env` de desarrollo
  (detectando plantillas sin editar y respaldándolas), aplica
  `alembic upgrade head`, levanta FastAPI (:8000) + Angular (:4200), verifica
  salud de ambos, abre el navegador y detiene todo con Ctrl+C.
  Opciones: `--legacy`, `--no-browser`, `--fresh`, puertos configurables.

### Corregido
- **select-company 500** (import `UserCompanyMembership` ausente en
  `router_auth.py`) detectado por smoke end-to-end del flujo de onboarding;
  añadido test de regresión `test_select_company.py` (flujo completo +
  rechazo de pertenencia ajena). Suite: 77 pytest en verde.
- Motor fiscal: `base` incorrecto en precios con IVA incluido
  (`test_units.py::test_taxes_included_extract`); validado con merge exacto.
- Validación de correo leniente (dominios internos `.local/.internal/.lan`):
  el login v1 rechazaba administradores legítimos de red local.

### Conocido y pendiente (declarado, no oculto)
- UI Angular sobre `/api/v1`: entregada la Fase 7 inicial (`/v1/*`); pendientes variantes completas, cotizaciones, caja y contabilidad.
- Caja, CxP, notas de crédito operativas, contabilidad partida doble (Fase 6).
- Integración fiscal FEL Guatemala: requiere validación legal/profesional antes
  de implementarse (§11 del pliego).
- Validación ejecutada de los instaladores en Windows y Fedora/Debian/Ubuntu.
- `VERCEL_OIDC_TOKEN` de `.env.local` debe rotarse (token real en working
  tree, no en Git).

### Compatibilidad
- La demo legada (Vercel + Hono/SQLite + Angular publicado) queda intacta y
  sigue funcionando. No se modificaron `src/`, `server/`, `api/`.
