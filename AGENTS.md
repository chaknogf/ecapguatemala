# AGENTS.md — ECAP CRM Académico

Guía operativa para agentes y desarrolladores que trabajen en este repositorio.
Léala antes de tocar código. El detalle de instalación está en `README.md`.

---

## 0. Reglas de oro

1. **No romper RBAC.** El backend autoriza; el frontend solo oculta UI. Toda ruta nueva debe
   tener su permiso en el backend y, si aplica, en `ROLE_PATTERNS` del frontend.
2. **No mezclar el stock con ECAP.** `api/`, `server/`, `infra/`, `scripts/`, `docs/`,
   `backend/legacy/`, `backend/tests/` y las features `v1/{products,sales,purchases,
   customers,movements,stock,alerts,audit,settings,help}` son legado. No agregar nada ahí.
3. **No usar emojis ni flechas tipográficas como iconos.** Usar `app-icon` / `app-nav-icon`.
4. **No introducir Tailwind ni librerías de UI.** SCSS + tokens existentes.
5. **No commitear `.env` ni secretos.** Solo `.env.example`.
6. **Verificar con `pnpm build` antes de entregar.** Un build roto no es entregable.
7. **La demo debe seguir funcionando con los 4 roles.** Probar admin, editor, docente y
   estudiante.

---

## 1. Inicio rápido

```bash
# Opción rápida: levanta y detiene ambos servicios
./dev.sh start        # backend :8000 + frontend :4200 en segundo plano
./dev.sh status       # estado, PIDs y salud
./dev.sh stop         # detiene ambos y libera los puertos

# Manual
# Backend
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Frontend (otra terminal, raíz del repo)
pnpm start            # http://localhost:4200
pnpm build            # build de producción
```

- Los logs y PID de `./dev.sh` quedan en `.run/` (ignorado por git).
- PostgreSQL debe estar corriendo con la base `ecap` migrada y sembrada.
- Si falta todo: ver `README.md` §5.
- Reset completo: `dropdb ecap && createdb ecap && alembic upgrade head && python -m app.seed`.

Credenciales: `admin@ecap.demo` / `editor@ecap.demo` / `maestro@ecap.demo` /
`estudiante01@ecap.demo`, contraseña `Demo1234!`.

---

## 2. Mapa de arquitectura

### Backend (`backend/app`)

| Archivo | Responsabilidad |
| --- | --- |
| `main.py` | `create_app()`, CORS, routers, `/api/v1/health` |
| `core/config.py` | `Settings` (pydantic-settings), validación de producción |
| `core/db.py` | `engine`, `SessionLocal`, `Base`, `get_session` |
| `core/deps.py` | `DbSession`, `Principal`, `get_principal`, `require_permission` |
| `core/permissions.py` | Matching de patrones (`*`, `recurso.*`) |
| `core/security.py` | Argon2id, JWT, refresh opaco, política de contraseñas |
| `core/errors.py` | Excepciones de dominio + handlers |
| `modules/identity/` | `models`, `schemas`, `service` (RBAC + login), `router_auth`, `router_users`, `router_audit` |
| `modules/academic/` | Cursos, aulas, unidades, lecciones, recursos, inscripciones, notas, avisos, progreso, stats |
| `modules/cms/` | Landing: secciones, publicaciones, noticias |
| `seed.py` | Datos demo (usuarios, cursos, aulas, contenido, CMS) |
| `cli.py` | `secret`, `create-admin` |
| `alembic/` | `env.py` + `versions/` (2 revisiones) |

Patrón de una ruta:

```python
@router.get("/courses", response_model=list[CourseOut])
def list_courses(session: DbSession, principal: PrincipalDep):
    ...
```

Con permiso:

```python
@router.post("/courses", response_model=CourseOut, status_code=201)
def create_course(
    payload: CourseCreate,
    session: DbSession,
    principal: PrincipalDep,
    _=Depends(require_permission("courses.manage")),
):
    return svc.create_course(session, payload, created_by=principal.user_id)
```

### Frontend (`src/app`)

| Archivo | Responsabilidad |
| --- | --- |
| `app.routes.ts` | Rutas: landing, login, `/app`, `/portal`, wildcard |
| `app.config.ts` | Zoneless, router, HTTP + interceptores |
| `core/v1/session.service.ts` | Sesión, tokens, `ROLE_PATTERNS`, `can()` |
| `core/v1/v1.guards.ts` | `v1AuthGuard`, `v1LoginGuard`, `v1PermissionGuard` |
| `core/v1/v1.interceptor.ts` | Bearer + refresh automático en 401 |
| `core/v1/session.models.ts` | Tipos de login/tokens/usuario |
| `core/academic/academic.service.ts` | Cliente tipado (laxo) de toda la API |
| `core/theme/theme.service.ts` | `data-theme` + `localStorage['synvapp-theme']` |
| `features/ecap/landing/` | Landing pública (`.ts` + `.html` + `.scss`) |
| `features/ecap/landing-manage/` | CMS del landing |
| `features/ecap/{users,courses,classrooms,content,enrollments,grades,announcements,activity}/` | CRUDs del panel |
| `features/ecap/portal/` | Shell + páginas del estudiante |
| `features/v1/login/` | Login split-screen |
| `features/v1/shell/` | Shell del panel (sidebar, topbar, drawer móvil, bottom nav) |
| `features/v1/dashboard/` | Dashboard bento |
| `features/v1/account/` | Cambio de contraseña |
| `shared/icon.component.ts` | Mapa SVG Lucide + Simple Icons |
| `shared/nav-icon.component.ts` | Iconos del shell/portal |
| `shared/ui.ts` | `ToastsComponent`, `ConfirmModalComponent`, `ToastService` |

---

## 3. Convenciones de código

### Frontend

- Componentes **standalone**, `ChangeDetectionStrategy` zoneless (global).
- Estado con **signals** (`signal`, `computed`); nada de `BehaviorSubject` para estado de vista.
- Suscripciones HTTP con `.subscribe({ next, error })`; no usar `async` pipe en las páginas
  nuevas salvo que ya exista en el archivo.
- `inject()` en lugar de constructor injection en código nuevo.
- Rutas siempre lazy (`loadComponent`).
- Copys de UI en **español**, tono institucional y sobrio. Fechas y números con
  `Intl`/`DatePipe` cuando aplique.
- Archivos grandes: preferir `templateUrl` + `styleUrl` externos (como login, shell,
  dashboard y landing) para evitar límites de tokens y facilitar diffs.
- Accesibilidad: `aria-label` en botones-icono, `aria-expanded` en disclosures, foco visible,
  `prefers-reduced-motion` respetado.

### Backend

- Python 3.11+, `from __future__ import annotations`, tipos modernos (`X | None`).
- SQLAlchemy 2.0: `Mapped[...]`, `mapped_column(...)`, `select(...)`, `session.execute`.
- Lógica en `service.py`; los routers solo orquestan y validan permisos.
- Errores de dominio (`AuthenticationError`, `PermissionDeniedError`, `NotFoundError`,
  `ConflictError`, `BusinessRuleError`), nunca `HTTPException` suelta en servicios.
- Permisos con patrones: `recurso.read`, `recurso.manage`, `recurso.*`, `*`.
- IDs UUID7; fechas con `DateTime(timezone=True)` en UTC.
- Cada cambio de modelo requiere migración Alembic + revisión manual del archivo generado.

---

## 4. Sistema de diseño

### App (panel, portal, login): "Obsidiana & Champán"

- Base `#09090B`, superficies `--surface`, `--surface-2`, `--surface-3`.
- Acento único champán: `--accent: #C8A96B` (oscuro) / `#8A6A2F` (claro).
- **Texto sobre botón primario: `var(--accent-contrast)`**, nunca `#fff`.
- Bordes hairline (`--line`), glass discreto (`--glass-card`), sombras suaves.
- Tipografía: Plus Jakarta Sans (títulos, `letter-spacing` negativo), Inter (texto),
  Fraunces (citas). Números tabulares en métricas.
- Transiciones: `transition: ... 300ms ease-out` (token `--ease`).
- Tokens y primitivas globales: `src/styles.scss`, `src/_v1-ui.scss`.
- Estados: loading con skeletons, vacío con icono + copy + CTA, error con mensaje claro.

### Landing pública: excepción clara y deliberada

- Tema **claro**, glassmorphism, aurora pastel (violeta, cielo, menta, coral, ámbar, rosa),
  profundidad 3D y sombras de color.
- Tokens locales bajo `:host` en `landing.component.scss`; **no** usar tokens del tema oscuro.
- Clases de botón locales: `.l-btn`, `.l-btn-primary`, `.l-btn-glass`.
- `ViewEncapsulation.Emulated`; todo el CSS vive bajo `:host`.
- El contenido viene del CMS: `landingSections(true)`, `publications(true)`, `news(true)`,
  `section(key)`.
- Claves CMS sembradas: `hero_title`, `hero_lead`, `quienes_somos`, `aula_virtual`.
- Presupuesto de estilos: aviso 32 kB / error 40 kB (el landing ronda 30 kB).

### Iconos

- `<app-icon name="arrow-right" />` → `shared/icon.component.ts`.
- `<app-nav-icon name="book" />` → `shared/nav-icon.component.ts`.
- Set disponible: Lucide (trazo) + Simple Icons (marcas: `facebook`, `youtube`, `x`,
  `instagram`). `close` es la X de cerrar; `x` es la marca social.
- Para añadir uno: obtener el body en `https://api.iconify.design/lucide.json?icons=<nombre>`
  y pegarlo en el mapa. Sin dependencias de red en runtime.

---

## 5. Recetas

### Añadir un endpoint

1. `schemas.py`: request/response con Pydantic.
2. `service.py`: función con `Session` + validaciones de negocio.
3. `router.py`: ruta + `Depends(require_permission("..."))`.
4. `src/app/core/academic/academic.service.ts`: método cliente.
5. Probar con `curl` y con el rol que **no** debe acceder (esperar 403).

### Añadir una pantalla al panel

1. Componente standalone en `src/app/features/ecap/<área>/`.
2. Ruta lazy en `app.routes.ts` con `v1PermissionGuard` si aplica.
3. Ítem en `v1-shell.component.ts` (`nav[]`) con `perm` correcto.
4. Reutilizar tokens y clases existentes; estados de carga/vacío/error.
5. Responsive: probar 360 px, 768 px y 1280 px.

### Añadir un ítem al portal del estudiante

1. Página en `features/ecap/portal/`.
2. Ruta hija en `app.routes.ts` bajo `portal`.
3. Enlace en `portal-shell.component.ts` (header y bottom nav; máximo 5 destinos).
4. Verificar que un rol no-estudiante es redirigido por `v1AuthGuard`.

### Añadir una sección editable del landing

1. Insertar la clave en `backend/app/seed.py` (`create_section`) y en una migración de datos
   si la base ya existe.
2. Consumirla en `landing.component.html` con `section('clave')?.content` y un fallback.
3. Verificar que `/app/landing` permite editarla.

### Añadir un permiso

1. `backend/app/modules/identity/service.py` → `ROLE_PERMISSIONS`.
2. Re-ejecutar `python -m app.seed` (sincroniza roles) o actualizar la tabla `role`.
3. Replicar en `ROLE_PATTERNS` de `src/app/core/v1/session.service.ts` **solo** para la UI.
4. Proteger la ruta del backend y, si aplica, la del frontend.

### Cambiar el esquema

```bash
cd backend && source .venv/bin/activate
alembic revision --autogenerate -m "descripcion"
# revisar backend/alembic/versions/<rev>.py
alembic upgrade head
```

---

## 6. Trampas conocidas (leer antes de depurar)

| Trampa | Detalle |
| --- | --- |
| Permisos duplicados | Backend (`ROLE_PERMISSIONS`) manda; frontend (`ROLE_PATTERNS`) solo oculta UI. Si divergen, la UI miente. |
| `PASSWORD_MIN_LENGTH` | El `.env` de demo usa `8` para permitir `Demo1234!`. El default del código es `10`. |
| `--accent-contrast` | El champán es claro: los botones primarios necesitan texto oscuro. |
| Claves de storage | Sesión: `ecap_access`, `ecap_refresh`, `ecap_user`. Tema: `synvapp-theme` (heredada). |
| `authInterceptor` legado | Solo actúa fuera de `/api/v1` con `synvapp_token`. No es el interceptor de ECAP. |
| Refresh concurrente | `v1Interceptor` comparte la promesa `refreshing`; no duplicar lógica. |
| Seed no idempotente | Usuarios/roles/categorías sí; cursos, aulas, CMS y contenido no. Recrear la base para un reset limpio. |
| `app.cli` | Ya no depende del módulo de inventario. Usar `python -m app.cli secret` / `create-admin`. |
| Tests | `backend/tests/` es del stock (inventario) y no cubre ECAP. No usarlo como gate; validar manualmente. |
| Presupuesto de estilos | `anyComponentStyle`: 32 kB warn / 40 kB error. El landing está cerca del límite. |
| `synvapp-inventory` | Identificador del proyecto Angular heredado; aparece en `angular.json` y `dist/`. No renombrar sin actualizar `angular.json`, `serve.buildTarget` y despliegues. |
| Landing y tema global | El landing **no** debe usar `var(--bg-primary)` ni tokens oscuros; define sus propios tokens. |
| CORS | Si cambia el puerto/dominio del frontend, actualizar `CORS_ORIGINS` y reiniciar el backend. |
| Swagger | Solo disponible si `ENVIRONMENT != production`. |

---

## 7. Verificación antes de entregar

```bash
# 1. Compila
pnpm build

# 2. Backend vivo y sano
curl -s http://127.0.0.1:8000/api/v1/health

# 3. Login y permisos
curl -s -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ecap.demo","password":"Demo1234!"}'

# 4. Un estudiante NO debe ver usuarios (esperado 403)
#    (repetir login con estudiante01@ecap.demo y llamar /api/v1/users)
```

Checklist visual:

- [ ] `/` carga sin sesión; CTAs llevan a `/login`.
- [ ] `/login` muestra cuentas demo y regresa al sitio.
- [ ] `admin` ve el panel completo y `/app/landing`.
- [ ] `editor` ve cursos, contenidos, usuarios (solo lectura) y sitio público.
- [ ] `teacher` ve solo sus aulas.
- [ ] `student` aterriza en `/portal/home`; no puede abrir `/app`.
- [ ] Tema claro/oscuro conmuta sin romper contraste.
- [ ] Móvil: drawer del panel, bottom nav del portal, landing sin scroll horizontal.
- [ ] Estados de carga, vacío y error visibles y coherentes.

---

## 8. Archivos que no deben modificarse sin intención explícita

- `backend/alembic/versions/*` ya aplicadas (crear una nueva, no editar históricas).
- `src/styles.scss` y `_v1-ui.scss`: cambios globales; afectan todas las pantallas.
- `backend/app/modules/identity/service.py`: RBAC y login.
- `backend/app/core/security.py`: hashing, JWT, política de contraseñas.
- `angular.json` (presupuestos y proxy) y `proxy.conf.json`.
- `README.md` / `AGENTS.md`: actualizarlos si cambia instalación, permisos o arquitectura.
