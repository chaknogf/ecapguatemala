# ECAP CRM Académico

Demo funcional de una plataforma CRM académica y de capacitación institucional para el
**Equipo de Estudios Comunitarios y Acción Psicosocial (ECAP Guatemala)**.

Incluye un sitio público editable, un panel de gestión con control de acceso por roles y un
portal independiente para estudiantes.

> **Estado:** demo funcional con datos de ejemplo. No está endurecida para producción
> (ver [Despliegue](#despliegue-y-producción)).

---

## 1. Alcance funcional

| Área | Qué hace |
| --- | --- |
| Sitio público (`/`) | Landing institucional con hero, quiénes somos, publicaciones, noticias y CTA al aula virtual. El contenido se lee del CMS. |
| Autenticación (`/login`) | Login con JWT (access + refresh), bloqueo por intentos fallidos y cambio de contraseña. |
| Panel de gestión (`/app`) | Dashboard, usuarios, cursos, aulas, contenidos (unidades/lecciones/recursos), asignaciones, calificaciones, avisos, actividad y gestión del sitio público. |
| Portal del estudiante (`/portal`) | Inicio, mis cursos, detalle de curso, aula virtual con reproductor, calificaciones, progreso y avisos. |
| CMS del landing (`/app/landing`) | CRUD de secciones, publicaciones y noticias visibles en el sitio público. |

Roles: `admin`, `editor`, `teacher`, `student`. El backend autoriza; el frontend solo oculta UI.

---

## 2. Stack técnico

### Frontend

| Pieza | Versión / decisión |
| --- | --- |
| Angular | **22.2** (standalone components, signals, `provideZonelessChangeDetection`) |
| TypeScript | **6.0** (`strict`) |
| Router | Lazy loading por `loadComponent`, guards funcionales, `withComponentInputBinding` |
| HTTP | `provideHttpClient(withFetch())` + interceptores funcionales |
| Estilos | SCSS puro con design tokens (sin Tailwind, sin librería de componentes) |
| Iconos | SVG inline propios (`IconComponent`, `NavIconComponent`) con paths de Lucide / Simple Icons |
| Fuentes | Plus Jakarta Sans (display), Inter (texto), Fraunces (citas) vía Google Fonts |
| Gestor de paquetes | **pnpm 12.15.0** (fijado en `packageManager`) |
| Build | `@angular/build` (esbuild) |

> El proyecto Angular conserva el identificador `synvapp-inventory` heredado del stock.
> No afecta el funcionamiento; solo aparece en `angular.json` y en `dist/`.

### Backend

| Pieza | Versión |
| --- | --- |
| Python | 3.11+ (probado con 3.15) |
| FastAPI | 0.162.0 |
| Uvicorn | 0.54.0 (`[standard]`) |
| Pydantic / pydantic-settings | 2.14.1 / 2.16.1 |
| SQLAlchemy | 2.1.6 (ORM 2.0, `DeclarativeBase`) |
| Alembic | 1.20.1 |
| Driver PostgreSQL | `psycopg[binary]` 3.3.6 |
| Hash de contraseñas | Argon2id (`argon2-cffi` 25.1.0) |
| Tokens | PyJWT 2.15.1 (HS256) |
| Servidor de desarrollo | `http://127.0.0.1:8000` |

### Base de datos

| Pieza | Valor |
| --- | --- |
| Motor | **PostgreSQL 18** (probado en 18.6; compatible con 14+) |
| Base de datos | `ecap` |
| Esquema | `public` (tenant único implícito) |
| Zona horaria | UTC (`DateTime(timezone=True)`) |
| Codificación | UTF8 |

---

## 3. Estructura del repositorio

```
.
├── src/                        # Frontend Angular (ACTIVO)
│   ├── app/
│   │   ├── app.routes.ts       # Mapa de rutas: landing, login, /app, /portal
│   │   ├── core/
│   │   │   ├── academic/       # AcademicService: cliente de la API académica
│   │   │   ├── auth/           # Interceptor legado del stock (no usa /api/v1)
│   │   │   ├── theme/          # ThemeService (dark/light, localStorage)
│   │   │   └── v1/             # SessionService, guards, interceptor JWT, modelos
│   │   ├── features/
│   │   │   ├── ecap/           # landing, portal, y CRUDs académicos (ACTIVO)
│   │   │   └── v1/             # login, shell, dashboard, cuenta (ACTIVO)
│   │   │                       # products, sales, purchases... (LEGADO del stock)
│   │   └── shared/             # IconComponent, NavIconComponent, toasts/modales
│   ├── styles.scss             # Tokens y primitivas globales (tema oscuro/claro)
│   ├── _v1-ui.scss             # Primitivas compartidas del panel
│   └── index.html              # Fuentes, meta, favicon
├── backend/                    # API FastAPI (ACTIVO)
│   ├── app/
│   │   ├── main.py             # create_app(), CORS, routers, /health
│   │   ├── cli.py              # `secret`, `create-admin`
│   │   ├── seed.py             # Datos de demostración
│   │   ├── core/               # config, db, security, deps, errors, permissions
│   │   └── modules/
│   │       ├── identity/       # usuarios, roles, auth, auditoría
│   │       ├── academic/       # cursos, aulas, contenido, notas, avisos, progreso
│   │       └── cms/            # landing_section, publication, news_item
│   ├── alembic/                # Migraciones (2 revisiones)
│   ├── tests/                  # LEGADO del stock (no cubre ECAP)
│   └── .env.example            # Plantilla de configuración
├── proxy.conf.json             # /api/v1 → localhost:8000
├── angular.json                # Build, serve, presupuestos de estilos
└── AGENTS.md                   # Guía operativa para agentes/desarrolladores
```

### Carpetas heredadas del stock (no forman parte de ECAP)

`api/`, `server/`, `infra/`, `scripts/`, `docs/`, `ARQUITECTURA.md`, `backend/legacy/`,
`backend/tests/`, `src/app/features/v1/{products,sales,purchases,customers,movements,stock,
alerts,audit,settings,help}`, `src/app/core/{inventory,v1/catalog.service.ts,
v1/inventory.service.ts, v1/purchases.service.ts, v1/sales.service.ts,
v1/platform.service.ts}` y los chips de inventario en `src/app/shared/ui.ts`.

Se conservan para referencia histórica. **No los use como fuente de verdad** y no agregue
funcionalidad nueva ahí.

---

## 4. Requisitos previos

| Herramienta | Versión recomendada | Verificación |
| --- | --- | --- |
| Node.js | 22.12+ (probado en 26) | `node -v` |
| pnpm | 12.x | `pnpm -v` |
| Python | 3.11+ (probado en 3.15) | `python3 --version` |
| PostgreSQL | 14+ (probado en 18.6) | `psql --version` |

En macOS con Homebrew:

```bash
brew install node pnpm python@3.12 postgresql@18
brew services start postgresql@18
```

---

## 5. Instalación

### 5.1 Base de datos

```bash
# Opción A: usar el superusuario local (rápido, solo desarrollo)
createdb ecap

# Opción B: rol dedicado (recomendado)
psql postgres -c "CREATE ROLE ecap WITH LOGIN PASSWORD 'cambie-esta-clave';"
createdb -O ecap ecap
```

Si usa la opción B, ajuste `DATABASE_URL` en `backend/.env`.

### 5.2 Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env               # ajuste DATABASE_URL y JWT_SECRET

alembic upgrade head               # crea las 21 tablas
python -m app.seed                 # datos de demostración

uvicorn app.main:app --reload --port 8000
```

Comprobaciones:

```bash
curl -s http://127.0.0.1:8000/api/v1/health
# {"ok":true,"service":"ecap-api","version":"0.1.0"}

open http://127.0.0.1:8000/api/v1/docs     # Swagger (solo si ENVIRONMENT != production)
```

### 5.3 Frontend

```bash
# desde la raíz del repositorio
pnpm install
pnpm start
```

- App: <http://localhost:4200>
- El dev server aplica `proxy.conf.json`: `/api/v1` → `http://localhost:8000`.
- La ruta `/` es pública (no requiere sesión).

### 5.4 Verificación rápida de la demo

1. Abrir `/` → landing carga secciones, publicaciones y noticias desde el CMS.
2. Entrar con `admin@ecap.demo` / `Demo1234!` → redirige a `/app/dashboard`.
3. Entrar con `estudiante01@ecap.demo` / `Demo1234!` → redirige a `/portal/home`.
4. En `/app/landing`, editar el hero y recargar `/` para ver el cambio.

---

## 6. Configuración de PostgreSQL

### Cadena de conexión

```
postgresql+psycopg://USUARIO:CONTRASEÑA@HOST:PUERTO/ecap
```

Ejemplo de desarrollo: `postgresql+psycopg://postgres:postgres@localhost:5432/ecap`.

El prefijo `+psycopg` es obligatorio (driver psycopg 3). `postgresql://` sin prefijo usa
psycopg2 y no está instalado.

### Parámetros del pool (`backend/app/core/db.py`)

| Variable | Default | Descripción |
| --- | --- | --- |
| `DB_POOL_SIZE` | `10` | Conexiones permanentes por proceso |
| `DB_MAX_OVERFLOW` | `5` | Conexiones extra temporales |
| `DB_POOL_TIMEOUT` | `30` | Segundos de espera por una conexión libre |

`pool_pre_ping=True` está activo: descarta conexiones muertas antes de usarlas.

### Tablas creadas por las migraciones

`user`, `role`, `refresh_session`, `login_attempt`, `activity_log`,
`course_category`, `course`, `classroom`, `course_enrollment`, `classroom_enrollment`,
`teacher_assignment`, `content_unit`, `lesson`, `resource`, `grade`, `announcement`,
`lesson_progress`, `landing_section`, `publication`, `news_item` y `alembic_version`.

Verificación:

```bash
psql -d ecap -c "\dt"
psql -d ecap -c "select version_num from alembic_version;"
```

### Respaldo y restauración

```bash
# Respaldo comprimido
pg_dump -Fc -d ecap -f ecap_$(date +%Y%m%d_%H%M).dump

# Restauración (destruye el contenido actual)
dropdb ecap && createdb ecap
pg_restore -d ecap --no-owner --clean --if-exists ecap_20260101_1200.dump
```

### Reinicio de datos de demostración

```bash
cd backend
source .venv/bin/activate
dropdb ecap && createdb ecap
alembic upgrade head
python -m app.seed
```

> `python -m app.seed` es idempotente para usuarios, roles y categorías, pero **no** para
> secciones del landing, publicaciones, noticias, cursos ni aulas: volver a ejecutarlo sobre
> una base ya sembrada duplica esos registros. Para un estado limpio, recree la base.

---

## 7. Variables de entorno del backend

Archivo: `backend/.env` (plantilla en `backend/.env.example`).

| Variable | Default del código | Uso en la demo | Notas |
| --- | --- | --- | --- |
| `DATABASE_URL` | `postgresql+psycopg://postgres:postgres@localhost:5432/ecap` | igual | Obligatoria |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` / `DB_POOL_TIMEOUT` | `10` / `5` / `30` | igual | Pool SQLAlchemy |
| `APP_NAME` | `ECAP CRM Académico` | igual | Título de la API |
| `ENVIRONMENT` | `development` | `development` | `production` desactiva Swagger y exige secreto fuerte |
| `DEBUG` | `false` | `true` | No puede ser `true` en producción |
| `JWT_SECRET` | `cambiar-este-secreto-en-produccion` | secreto de dev | Genere uno con `python -m app.cli secret` |
| `JWT_ALGORITHM` | `HS256` | igual | — |
| `ACCESS_TOKEN_TTL_MINUTES` | `15` | `60` | Minutos de vida del access token |
| `REFRESH_TOKEN_TTL_DAYS` | `14` | igual | Días de vida del refresh token |
| `ISSUER` / `AUDIENCE` | `synvapp` / `synvapp-api` | `ecap` / `ecap-api` | Claims del JWT |
| `PASSWORD_MIN_LENGTH` | `10` | `8` | 8 permite `Demo1234!` (9 caracteres) |
| `LOGIN_MAX_ATTEMPTS` | `5` | igual | Intentos antes del bloqueo |
| `LOGIN_LOCKOUT_MINUTES` | `15` | igual | Duración del bloqueo |
| `CORS_ORIGINS` | `["http://localhost:4200"]` | igual | JSON array; debe incluir el origen del frontend |
| `UPLOAD_DIR` | `data/uploads` | — | Reservado para archivos |
| `MAX_UPLOAD_MB` | `5` | — | Reservado para archivos |
| `BACKUP_DIR` | `data/backups` | — | Reservado para respaldos |

En producción `assert_production_safe()` falla al arrancar si `ENVIRONMENT=production` y el
secreto es el de desarrollo, mide menos de 32 caracteres, o si `DEBUG=true`.

---

## 8. Usuarios, credenciales y permisos

### Credenciales de demostración

**Contraseña para todas las cuentas: `Demo1234!`**

| Correo | Nombre | Rol | Destino al iniciar sesión |
| --- | --- | --- | --- |
| `admin@ecap.demo` | Administrador ECAP | `admin` | `/app/dashboard` |
| `editor@ecap.demo` | Editor Académico | `editor` | `/app/dashboard` |
| `editor2@ecap.demo` | Editor de Contenidos | `editor` | `/app/dashboard` |
| `maestro@ecap.demo` | Carlos Méndez | `teacher` | `/app/dashboard` |
| `maestra2@ecap.demo` | María López | `teacher` | `/app/dashboard` |
| `maestro3@ecap.demo` | José Ramírez | `teacher` | `/app/dashboard` |
| `maestra4@ecap.demo` | Ana García | `teacher` | `/app/dashboard` |
| `estudiante01@ecap.demo` … `estudiante20@ecap.demo` | 20 estudiantes de ejemplo | `student` | `/portal/home` |

Teléfonos de ejemplo: `555-0001` (admin), `555-0002`/`555-0003` (editores),
`555-0101`…`555-0104` (docentes), `555-2001`…`555-2020` (estudiantes).

### Matriz de permisos

Los patrones se declaran en `backend/app/modules/identity/service.py` (`ROLE_PERMISSIONS`) y se
siembran en la tabla `role`. El frontend replica un subconjunto en
`src/app/core/v1/session.service.ts` (`ROLE_PATTERNS`) **solo para ocultar UI**.

| Permiso | admin | editor | teacher | student |
| --- | :-: | :-: | :-: | :-: |
| `users.read` | ✅ | ✅ | — | — |
| `users.manage` | ✅ | — | — | — |
| `landing.*` / `landing.manage` | ✅ | ✅ | — | — |
| `courses.*` / `courses.manage` | ✅ | ✅ | solo lectura | solo lectura |
| `classrooms.*` / `classrooms.manage` | ✅ | ✅ | ✅ (propias) | solo lectura |
| `content.*` / `content.manage` | ✅ | ✅ | ✅ | solo lectura |
| `materials.*` / `materials.manage` | ✅ | ✅ | ✅ | solo lectura |
| `assignments.*` | ✅ | ✅ | ✅ | — |
| `grades.*` / `grades.manage` | ✅ | lectura | ✅ | lectura |
| `announcements.*` | ✅ | ✅ | ✅ | lectura |
| `progress.read` | ✅ | — | ✅ | ✅ |
| `reports.read` | ✅ | ✅ | ✅ | — |
| `*` (comodín) | ✅ | — | — | — |

Reglas de navegación:

- `student` no puede entrar a `/app/*` → redirige a `/portal/home`.
- Cualquier otro rol no puede entrar a `/portal/*` → redirige a `/app/dashboard`.
- Rutas con `v1PermissionGuard` exigen el permiso indicado en `app.routes.ts`.

### Crear un administrador real

```bash
cd backend
source .venv/bin/activate
python -m app.cli secret                       # genera JWT_SECRET
python -m app.cli create-admin --email admin@midominio.gt
# o sin interacción:
ADMIN_PASSWORD='...' python -m app.cli create-admin \
  --email admin@midominio.gt --full-name "Admin" --password-env ADMIN_PASSWORD
```

El comando crea o actualiza el usuario con rol `admin`, activo y sin cambio obligatorio.

### Cambio de contraseña

- UI: `/app/change-password`.
- API: `POST /api/v1/auth/change-password` con `current_password` y `new_password`.
- La política exige `PASSWORD_MIN_LENGTH`, mayúscula, minúscula y dígito.

---

## 9. API

Base: `/api/v1`. Documentación interactiva: `/api/v1/docs` (solo fuera de producción).

### Autenticación

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ecap.demo","password":"Demo1234!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["tokens"]["access_token"])')

curl -s http://127.0.0.1:8000/api/v1/users -H "Authorization: Bearer $TOKEN"
```

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/auth/login` | Devuelve `tokens` + `user` |
| POST | `/auth/refresh` | Rota el refresh token |
| POST | `/auth/logout` | Revoca el refresh token |
| POST | `/auth/change-password` | Cambia la contraseña del usuario autenticado |

### Recursos

| Grupo | Rutas principales |
| --- | --- |
| Usuarios | `GET/POST /users`, `GET/PATCH/DELETE /users/{id}`, `GET /users/roles/list` |
| Catálogo | `GET/POST /categories`, `GET/POST /courses`, `GET/PATCH/DELETE /courses/{id}` |
| Aulas | `GET/POST /classrooms`, `GET/PATCH/DELETE /classrooms/{id}` |
| Contenido | `GET/POST /classrooms/{id}/units`, `PATCH/DELETE /units/{id}`, `GET/POST /units/{id}/lessons`, `PATCH/DELETE /lessons/{id}`, `GET/POST /resources` |
| Inscripciones | `POST/DELETE/GET /enrollments/course`, `POST/DELETE/GET /enrollments/classroom` |
| Docentes | `GET/POST /teacher-assignments`, `DELETE /teacher-assignments/{id}` |
| Notas | `GET/POST /grades`, `PATCH/DELETE /grades/{id}` |
| Avisos | `GET/POST /announcements`, `DELETE /announcements/{id}` |
| Progreso | `GET/POST /progress` |
| Actividad | `GET /activity`, `GET /audit` (stub que devuelve `[]`) |
| Métricas | `GET /stats/dashboard`, `GET /people/students`, `GET /people/teachers` |
| CMS landing | `GET /landing/sections`, `GET /landing/publications`, `GET /landing/news` (públicas) |
| CMS admin | `POST/PATCH/DELETE /landing/sections/{key}`, `POST/PATCH/DELETE /landing/publications/{id}`, `POST/PATCH/DELETE /landing/news/{id}` |
| Salud | `GET /health` |

Los endpoints del CMS de escritura requieren `landing.manage`. Las lecturas del landing son
públicas (`published_only=true` por defecto).

### Formato de errores

```json
{ "message": "Permiso requerido: users.read", "code": "permission_denied" }
```

| Código HTTP | Causa típica |
| --- | --- |
| 401 | Token ausente, expirado o credenciales inválidas |
| 403 | Rol sin el permiso requerido |
| 404 | Recurso inexistente |
| 409 | Conflicto de negocio (correo duplicado, contraseña débil) |
| 422 | Validación de payload |
| 429 | Demasiados intentos de login (bloqueo temporal) |

---

## 10. Frontend

### Rutas

| Ruta | Componente | Acceso |
| --- | --- | --- |
| `/` | `LandingComponent` | Público |
| `/login` | `V1LoginComponent` | Solo sin sesión |
| `/app/dashboard` | `V1DashboardComponent` | Autenticado |
| `/app/users` | `UsersComponent` | `users.read` |
| `/app/courses`, `/app/courses/:id` | `CoursesComponent`, `CourseDetailComponent` | Autenticado |
| `/app/classrooms` | `ClassroomsComponent` | Autenticado |
| `/app/content` | `ContentComponent` | Autenticado |
| `/app/enrollments` | `EnrollmentsComponent` | `assignments.manage` |
| `/app/grades` | `GradesComponent` | Autenticado |
| `/app/announcements` | `AnnouncementsComponent` | Autenticado |
| `/app/activity` | `ActivityComponent` | Autenticado |
| `/app/landing` | `LandingManageComponent` | `landing.manage` |
| `/app/change-password` | `ChangePasswordComponent` | Autenticado |
| `/portal/home` | `PortalHomeComponent` | `student` |
| `/portal/courses`, `/portal/courses/:id` | `PortalCoursesComponent`, `PortalCourseDetailComponent` | `student` |
| `/portal/classroom/:id` | `PortalClassroomComponent` | `student` |
| `/portal/grades` | `PortalGradesComponent` | `student` |
| `/portal/progress` | `PortalProgressComponent` | `student` |
| `/portal/announcements` | `PortalAnnouncementsComponent` | `student` |
| `**` | Redirige a `/` | — |

### Sesión y tokens

- `SessionService` guarda en `localStorage`: `ecap_access`, `ecap_refresh`, `ecap_user`.
- `v1Interceptor` agrega `Authorization: Bearer` a todo `/api/v1`, excepto `login` y `refresh`.
- Ante `401` intenta refrescar una sola vez (`refreshing` compartido) y reintenta la petición.
- `authInterceptor` es legado del stock: usa la clave `synvapp_token` y solo aplica a rutas que
  **no** sean `/api/v1`. No lo use para la API actual.

### Tema

- `ThemeService` aplica `data-theme="dark|light"` en `<html>` y lo guarda en
  `localStorage['synvapp-theme']` (clave heredada, por compatibilidad).
- Default: oscuro.

### Sistema de diseño

Dos direcciones visuales conviven:

1. **App (panel + portal + login):** "Obsidiana & Champán" — base oscura `#09090B`,
   superficies en capas, acento champán `#C8A96B` (`#8A6A2F` en claro), bordes hairline,
   tipografía editorial con `letter-spacing` negativo y números tabulares.
   Tokens en `src/styles.scss`. Primitivas compartidas en `src/_v1-ui.scss`.
2. **Landing pública:** excepción deliberada — tema claro, glassmorphism, aurora pastel y
   profundidad 3D. Tokens locales en `src/app/features/ecap/landing/landing.component.scss`
   bajo `:host`; no depende del tema global.

Reglas rápidas:

- Botones primarios: usar `var(--accent-contrast)` como color de texto, nunca `#fff`
  (el champán es claro y necesita texto oscuro).
- En el landing, los botones son `.l-btn` / `.l-btn-primary` / `.l-btn-glass` (locales).
- Iconos: `<app-icon name="..." />` (mapa Lucide + Simple Icons en
  `src/app/shared/icon.component.ts`) o `<app-nav-icon name="..." />` para el shell.
  No usar emojis ni flechas tipográficas (`↗`, `→`) como iconos.
- El landing usa `ViewEncapsulation.Emulated` y estilos con scope `:host`.

### Presupuestos de build

`angular.json` permite hasta **32 kB** de aviso y **40 kB** de error por hoja de componente.
El landing ronda los 30 kB por su riqueza visual; si crece, divida estilos o suba el límite
conscientemente.

---

## 11. Comandos de desarrollo

| Comando | Qué hace |
| --- | --- |
| `./dev.sh start` | Levanta backend y frontend en segundo plano (logs en `.run/`) |
| `./dev.sh stop` | Detiene ambos servicios y libera los puertos 8000 y 4200 |
| `./dev.sh restart` | Reinicia ambos servicios |
| `./dev.sh status` | Muestra PIDs, puertos y salud del backend |
| `./dev.sh logs` | Sigue los logs (`backend`, `frontend` o `all`) |
| `pnpm start` | Dev server en `:4200` con proxy al backend |
| `pnpm build` | Build de producción en `dist/` |
| `pnpm watch` | Build incremental de desarrollo |
| `pnpm test` | Tests unitarios (Vitest; hoy solo existe un spec legado del stock) |
| `cd backend && uvicorn app.main:app --reload --port 8000` | API con recarga |
| `alembic upgrade head` | Aplica migraciones |
| `alembic revision --autogenerate -m "mensaje"` | Nueva migración |
| `python -m app.seed` | Siembra datos demo |
| `python -m app.cli secret` | Genera `JWT_SECRET` |
| `python -m app.cli create-admin` | Crea/actualiza administrador |

---

## 12. Mantenimiento

### Cambiar el esquema

1. Editar modelos en `backend/app/modules/<módulo>/models.py`.
2. `cd backend && source .venv/bin/activate`
3. `alembic revision --autogenerate -m "descripcion_corta"`
4. Revisar el archivo generado en `backend/alembic/versions/` (Alembic no detecta todo).
5. `alembic upgrade head`.
6. Actualizar `backend/app/seed.py` si el nuevo campo debe existir en la demo.

### Agregar un endpoint

1. Esquema Pydantic en `schemas.py`.
2. Lógica en `service.py` (sin acceso HTTP).
3. Ruta en `router.py` con `DbSession`, `PrincipalDep` y `Depends(require_permission("..."))`.
4. Registrar el router en `backend/app/main.py` solo si es un módulo nuevo.
5. Añadir el método en `src/app/core/academic/academic.service.ts`.

### Agregar una pantalla

1. Crear el componente standalone en `src/app/features/ecap/<área>/`.
2. Registrar la ruta lazy en `src/app/app.routes.ts` (con guard si aplica).
3. Añadir el ítem de navegación en `v1-shell.component.ts` (panel) o
   `portal-shell.component.ts` (portal), con el permiso correcto.
4. Reutilizar tokens y primitivas existentes; no introducir otra paleta.

### Actualizar dependencias

```bash
pnpm outdated && pnpm update
cd backend && source .venv/bin/activate && pip list --outdated
```

Tras actualizar Angular, ejecute `pnpm build` y pruebe login, panel, portal y landing.
Tras actualizar FastAPI/SQLAlchemy, ejecute las migraciones y `pytest` (los tests actuales son
legado; valide manualmente los flujos de la sección 5.4).

### Problemas frecuentes

| Síntoma | Causa / solución |
| --- | --- |
| `ModuleNotFoundError: app` | Ejecutar los comandos desde `backend/` con el venv activo |
| `connection refused` en `:8000` | El backend no está corriendo o el puerto está ocupado (`lsof -i :8000`) |
| `401` en todas las llamadas | Token expirado y refresh inválido: vuelva a iniciar sesión |
| `403` en `/api/v1/users` | El rol no tiene `users.read` (comportamiento esperado) |
| CORS bloqueado | Agregar el origen exacto a `CORS_ORIGINS` y reiniciar el backend |
| `password authentication failed` | `DATABASE_URL` no coincide con el rol/clave de PostgreSQL |
| `relation "user" does not exist` | Faltan migraciones: `alembic upgrade head` |
| El landing no muestra cambios | El contenido se guardó como borrador (`published=false`) |
| Build falla por presupuesto de estilos | Ver sección 10 y `angular.json` |
| `alembic` no detecta un cambio | Importar el modelo en `alembic/env.py` y revisar el diff |

---

## 13. Despliegue y producción

Checklist mínimo:

1. `ENVIRONMENT=production`, `DEBUG=false`.
2. `JWT_SECRET` de al menos 32 caracteres (`python -m app.cli secret`).
3. `CORS_ORIGINS` con el dominio real del frontend.
4. PostgreSQL con rol dedicado y contraseña fuerte; no exponer el puerto públicamente.
5. `alembic upgrade head` antes de arrancar.
6. Servir el build de Angular (`dist/`) detrás de un proxy que reenvíe `/api/v1` a FastAPI.
7. HTTPS obligatorio (los tokens viajan en `Authorization`).
8. Swagger/OpenAPI quedan deshabilitados automáticamente en producción.
9. Programar respaldos con `pg_dump` y probar la restauración.

Ejemplo de despliegue estático + API:

```bash
pnpm build
# publicar dist/synvapp-inventory/browser en Nginx/Vercel/Netlify
# proxy /api/v1 → http://127.0.0.1:8000
```

---

## 14. Documentación relacionada

- `AGENTS.md` — guía operativa y convenciones para futuros cambios.
- `backend/app/modules/identity/service.py` — fuente de verdad de permisos.
- `backend/alembic/versions/` — historial del esquema.
- `docs/` — documentación del stock original (inventario/ERP); **no aplica a ECAP**.

---

## 15. Licencia

Ver `LICENSE`.
# ecapguatemala
