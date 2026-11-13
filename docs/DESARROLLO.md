# Guía de desarrollo (local)

Este documento explica cómo correr el proyecto en una máquina de desarrollo.
Hay dos aplicaciones conviviendo:

- **Legado** (demo Vercel): Angular + servidor Hono/SQLite (`server/`). Sigue
  operativo tal como estaba; no se reemplaza en esta fase.
- **Núcleo v1** (ERP nuevo): backend FastAPI + PostgreSQL en `backend/`,
  con 64 endpoints `/api/v1/...`.

## 1. Requisitos

| Componente | Versión mínima | Uso |
|---|---|---|
| Node.js | 20+ (recomendado 22) | Frontend Angular + servidor legado |
| pnpm | 11.x | Gestor del workspace |
| Python | 3.12 – 3.14 | Backend v1 (probado con 3.14 y 3.12 en contenedor) |
| PostgreSQL | 15+ (desarrollado/validado con 18) | Base de datos v1 |

Opcional para despliegue completo: Podman 4+ con `podman-compose`, o Docker 24+
con el plugin `docker compose`.

## 2. Backend v1 (FastAPI + PostgreSQL)

### 2.1 Base de datos

Cree la base y el usuario (una sola vez):

```bash
createdb synvapp                       # macOS/Linux con psql instalado
createdb synvapp_test                  # base de pruebas aislada
```

En Windows (PostgreSQL服务 como usuario `postgres`):

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\createdb.exe' -U postgres synvapp
& 'C:\Program Files\PostgreSQL\18\bin\createdb.exe' -U postgres synvapp_test
```

### 2.2 Entorno virtual y dependencias

```bash
cd backend
python3 -m venv .venv                  # Windows: py -3 -m venv .venv
.venv\bin\activate                     # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2.3 Configuración local

```bash
cp .env.example .env
# edite .env — NUNCA versionamos secretos:
#   DATABASE_URL=postgresql+psycopg://usuario:clave@localhost:5432/synvapp
#   JWT_SECRET=$(python -m app.cli secret)   # genere siempre uno nuevo
```

En Linux/macOS: `chmod 600 .env`. En Windows la carpeta queda protegida por
NTFS (el instalador aplica `icacls`).

### 2.4 Migraciones

```bash
cd backend
alembic upgrade head          # aplica el esquema completo (2 revisiones)
alembic revision -m "cambio" --autogenerate    # al modificar modelos (revisar el diff)
alembic downgrade -1          # rollback de una revisión (las migraciones son reversibles)
```

### 2.5 Crear el primer administrador

```bash
cd backend
python -m app.cli create-admin
# pedirá correo y contraseña por getpass (nunca como argumento de CLI)
# o, para automatizar sin dejar la clave en el historial de shell:
SYNVAPP_BOOTSTRAP_PASSWORD='...' python -m app.cli create-admin --password-env SYNVAPP_BOOTSTRAP_PASSWORD --email root@localhost
```

Diferencia importante: el administrador de plataforma gestiona la **instalación**
(crear empresas, asignar roles). La administración **comercial** de cada empresa
la ejerce el rol `admin_empresa` asignado por empresa.

### 2.6 Ejecutar la API

**Recomendado — un solo comando levanta backend + frontend** (crea `.venv` e
instala si falta, aplica `alembic upgrade head`, sondea salud, detiene todo con
Ctrl+C):

```bash
./scripts/dev.sh        # Linux/macOS → http://localhost:4200/v1/login
.\scripts\dev.ps1         # Windows PowerShell
# opciones: --legacy | --no-browser | --fresh | -ApiPort N -WebPort N
```

Solo el backend (la app v1 sirve su proxy a `:8000`):

```bash
cd backend
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
# docs (solo development): http://127.0.0.1:8000/api/v1/docs
# salud:                    http://127.0.0.1:8000/api/v1/health
```

⚠️ Use siempre el **uvicorn del venv**: con el Python global faltan las
dependencias (PyJWT, fastapi…) y falla con
`ModuleNotFoundError: No module named 'jwt'`.

En modo `production` (variable `ENVIRONMENT=production`) las docs OpenAPI
quedan deshabilitadas y arrancar con `JWT_SECRET` por defecto está bloqueado.

### 2.7 Pruebas (pytest sobre PostgreSQL real)

```bash
cd backend
TEST_DATABASE_URL='postgresql+psycopg://usuario:clave@localhost:5432/synvapp_test' \
  python -m pytest
```

- Las pruebas **crean el esquema con las mismas migraciones Alembic de
  producción** (no `create_all`): validan migraciones en cada corrida.
- Estado actual de la suite: **77 pruebas, todas en verde** (autenticación con
  rotación de refresh y bloqueo por intentos, RBAC, aislamiento multiempresa,
  catálogo/variantes/códigos de barras, atributos validados, cálculo de
  márgenes/recargos, recepciones parciales, transferencias atómicas, lotes +
  FEFO + bloqueo de vencidos, reservas, reversos, idempotencia, conciliación
  de inventario, ciclo completo compra→venta→factura→cobro, dashboard).

### 2.8 Scripts de utilidad

```bash
python -m app.cli secret                       # secreto aleatorio para .env
python -m app.cli reconcile-stock --company-id <uuid>   # invariante saldos↔movimientos
python -m legacy.migrate_sqlite --sqlite ../server/data/app.db --dry-run   # análisis
python -m legacy.migrate_sqlite --sqlite ../server/data/app.db             # migrar datos legados
```

## 3. Frontend (Angular 22 standalone)

```bash
# desde la raíz del repositorio
./scripts/dev.sh              # ← un comando: backend + frontend
pnpm install                  # (si se trabaja solo el frente)
pnpm start                    # ng serve :4200 — requiere API v1 en :8000
pnpm build                    # dist/synvapp-inventory/browser (producción)
pnpm test                     # vitest legado (estado actual: 64 pruebas en verde)
```

`proxy.conf.json` enruta `/api/v1` → FastAPI (:8000) y `/api` → legado (:1337),
así ambas interfaces conviven en el mismo dev server.

**App v1 (`/v1/...`)** — conectada 100 % a `/api/v1`, sin datos simulados:

| Ruta | Pantalla | Permiso de acceso |
|---|---|---|
| `/v1/login` | Login + selección de empresa | público |
| `/v1/dashboard` | KPIs reales + onboarding "primera empresa" | `reportes.dashboard.leer` |
| `/v1/products` | Catálogo | `catalogo.productos.leer` |
| `/v1/stock` | Existencias con semáforos + lotes por vencer | `inventario.stock.leer` |
| `/v1/movements` | Entrada/salida/ajuste/transferencia, alta de lote, FEFO, kardex y reversos | `inventario.stock.leer` |
| `/v1/purchases` | OC → aprobación → recepción parcial | `compras.ordenes.crear` |
| `/v1/sales` | Pedido → confirmar (reserva) → despacho → factura → cobro + CxC | `ventas.pedidos.leer` |
| `/v1/customers` | Clientes | `clientes.leer` |
| `/v1/users` | Usuarios y roles | `usuarios.permisos.administrar` |
| `/v1/settings` | Empresa, políticas, sucursales/bodegas, maestros | `configuracion.empresa.editar` |
| `/v1/audit` | Bitácora con diff antes/después | `auditoria.registros.leer` |

La demo legada sigue viva en `/login`, `/inventory`, `/despacho` (sin cambios).
Los menús/acciones v1 se ocultan según los roles del token — la autorización
real la aplica siempre el backend. Pendientes de cobertura UI: edición avanzada
de variantes, cotizaciones, caja y contabilidad.

## 4. Servidor legado (demo Vercel)

```bash
pnpm server:dev               # Hono + SQLite en :1337 (data en server/data/app.db)
```

- Contraseña mínima 6 y auto-registro: es la demo antigua **con las debilidades
  documentadas** en `docs/DIAGNOSTICO.md`; úsela solo para comparar, no para
  datos reales.
- El despliegue Vercel original sigue funcionando; este repositorio conserva su
  configuración sin cambios.

## 5. Despliegue con contenedores (opcional en desarrollo)

```bash
cp .env.example .env          # raíz — rellene POSTGRES_PASSWORD y JWT_SECRET
podman-compose -f infra/compose.yml --env-file .env up -d
# API: http://127.0.0.1:8000/api/v1/health  (solo loopback; Postgres sin puerto)
```

Equivalente Docker: `docker compose -f infra/compose.yml --env-file .env up -d`.

`scripts/synvapp.sh` (Linux) y `scripts/synvapp.ps1` (Windows) orquestan
instalación, administración, backup/restore y exposición (local/LAN/Caddy/
Cloudflare Tunnel). **Validación real de `install` completa en Windows y
Fedora/Debian/Ubuntu pendiente**: en este entorno macOS no hay runtime de
contenedores y el pliego prohíbe declarar compatibilidad no probada.

## 6. Flujo recomendado de desarrollo

1. Modelos nuevos → añada el import en `alembic/env.py` → `alembic revision --autogenerate`
   → **revise el diff generado** (no aplique migraciones destructivas a ciegas) → `upgrade head`.
2. Servicios de dominio en `app/modules/<módulo>/service.py` (reglas comerciales en backend).
3. Routers delgados: permisos con `principal.require("modulo.accion")`.
4. Prueba cada flujo con pytest **antes** de exponerlo en la UI; verifique
   resultados (no solo códigos HTTP).
5. Mantenga `pnpm test` del frontend en verde y sincronice este documento con el código.
