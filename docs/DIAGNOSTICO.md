# Diagnóstico del proyecto existente (Fase 1)

Fecha: 2026-10-27 · Rama analizada: `main` (24ea0e9) · Árbol de trabajo limpio.

## 1. Estado actual

SynvappInventory es una demo funcional de control de inventario compuesta por:

- **Frontend**: Angular 22 standalone con Signals, 4 vistas (login, dashboard, inventario, despacho), escáner de códigos ZXing con cámara, tema claro/oscuro con variables CSS semánticas, 64 pruebas unitarias vitest en paso.
- **Backend**: Hono 4 + `@libsql/client` sobre SQLite local (`server/data/app.db: 3 usuarios, 11 productos, 11 movimientos`) o Turso en Vercel.
- **Despliegue actual**: Vercel (estáticos Angular + serverless function Node).

El producto resuelve un caso de uso estrecho: entradas/salidas de un almacén único con stock denormalizado. No es un ERP.

## 2. Hallazgos

| # | Hallazgo | Ubicación | Severidad |
|---|---|---|---|
| F1 | Stack backend no conforme: Hono + SQLite/Turso en lugar de FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL | `server/` | Crítica |
| F2 | Monolito de 388 líneas con SQL inline, sin servicios/repositorios/capas | `server/src/app.ts` | Alta |
| F3 | JWT artesanal HS256 con secreto de respaldo hardcodeado (`synvapp-dev-secret-change-me`); sin verificación de `iss/aud`; TTL 7 días; sin refresh, sin revocación, sin rotación | `server/lib/auth.ts:3` | Crítica |
| F4 | Hash de contraseñas scrypt (no Argon2id), mínimo 6 caracteres | `server/lib/auth.ts:17`, `app.ts:46` | Alta |
| F5 | Auto-registro público sin roles ni permisos; cualquier usuario es equivalente a administrador | `app.ts:34` | Crítica |
| F6 | Endpoints de lectura sin autenticación: catálogo y movimientos son públicos | `app.ts:93,206,340` | Crítica |
| F7 | `DELETE /api/documents/:id` elimina movimientos históricos y revierte stock con `MAX(0, ...)`; viola inmutabilidad del histórico y puede corromper saldos | `app.ts:361-386` | Crítica |
| F8 | Stock denormalizado (`products.stock`) sin `SELECT ... FOR UPDATE`: carrera TOCTOU entre lectura de existencia y escritura; ventas concurrentes pueden sobreventa | `app.ts:297-334` | Crítica |
| F9 | Sin multiempresa, sin sucursales, sin bodegas, sin aislamiento de datos | Global | Alta |
| F10 | Sin campos monetarios (costo, precio, impuestos, moneda, margen); enteros de cantidad únicamente | `server/lib/db.ts:61` | Alta |
| F11 | Sin lotes, vencimientos, series, transferencias, reservas, ajustes aprobables, kardex por bodega | Global | Alta |
| F12 | Dashboard con KPIs hardcodeados ficticios (128/342/187/7) | `src/app/features/dashboard/dashboard.component.ts` | Alta |
| F13 | Migraciones de esquema implícitas con `ensureColumn`/`CREATE TABLE IF NOT EXISTS`; sin versionado ni rollback | `server/lib/db.ts:86-117` | Media |
| F14 | `.env.local` contiene un `VERCEL_OIDC_TOKEN` real (no versionado en Git; rotar y eliminar del working tree) | `.env.local` | Media |
| F15 | Usuario y token en `localStorage`; sin expiración de sesión gestionada | `auth.service.ts` | Media |
| F16 | CORS `origin: '*'` en la API | `app.ts:11` | Media |
| F17 | Sin control de concurrencia, sin transacciones multi-solicitud atómicas con aislamiento serio (batch de libSQL es lo único disponible) | `app.ts` | Alta |
| F18 | Duplicación de enrutamiento: funciones serverless `api/*.ts` re-expresan la misma app; mantenimiento doble | `api/` | Baja |
| F19 | Usuarios semilla con credenciales fijas conocidas (`demo@synvapp.com / secret123`) creados automáticamente | `server/lib/db.ts:48` | Alta |
| F20 | Auditoría comercial inexistente (no se registra quién movió qué) | Global | Alta |

## 3. Evaluación por componente (conservar / reemplazar)

### Conservar (supera la evaluación técnica)

- Base Angular 22 standalone, `app.config.ts`, enrutado con lazy-loading, workspace pnpm, `proxy.conf.json`.
- `ThemeService` + `styles.scss`: sistema de variables semánticas con temas claro/oscuro (requisito §17 cumplido; se extiende, no se reescribe).
- Esqueleto de autenticación frontend (guard, interceptor, servicio) — se amplía con refresh tokens y permisos.
- Escáner ZXing (cámara + tolerancia de SKU) como patrón de UX reutilizable.
- `LedgerComponent`: concepto de kardex con conciliación apertura+debe−haber; se reimplementa sobre el backend nuevo con datos por bodega/lote.
- Suite vitest existente (64 pruebas) — se mantiene verde durante toda la refactorización.
- Datos locales SQLite (`server/data/app.db`) — fuente del script de migración de datos de Fase 8/9.
- Despliegue Vercel del legado: queda congelado y operativo durante la refactorización; se retira solo cuando el frontend nuevo lo sustituya.

### Reemplazar (no supera la evaluación)

- Backend completo (F1–F8, F17, F19, F20): sustituido por FastAPI modular + PostgreSQL.
- Modelo de datos SQLite: sustituido por esquema PostgreSQL versionado con Alembic (multiempresa, RBAC, catálogo, bodegas, lotes, movimientos con saldo materializado reconciliable).
- Dashboard con datos ficticios (F12): se reconstruye contra indicadores reales del backend.
- Auto-registro público (F5): se elimina del núcleo; el primer administrador se crea por bootstrap del instalador.

## 4. Supuestos documentados

- No existe requisito comercial cerrado de Guatemala (FEL) en el repositorio; la arquitectura de facturación fiscal se deja desacoplada y sin implementación legal hasta verificación profesional (§11 del pliego).
- El negocio semilla actual (electrónica: pza/m) se modela como empresa de ejemplo; no se migran automáticamente sus movimientos hasta validar el esquema destino.
- La instalación objetivo es local/single-server con posibilidad multi-empresa; el modo SaaS hosting queda fuera del alcance inmediato.

## 5. Riesgos principales

1. Concurrencia de inventario sin bloqueos → sobreventa (corregido en el núcleo nuevo con `FOR UPDATE` + restricción de no-negativo).
2. Pérdida de trazabilidad por borrado de movimientos (corregido: inmutabilidad + reversos).
3. Secretos débiles/hardcodeados (corregido: generación en instalación, Argon2id, tokens cortos + refresh con rotación).
4. Frontend desincronizado durante la transición (mitigado: legado operativo; el nuevo frontend consume `/api/v1` conforme se valide cada módulo).
