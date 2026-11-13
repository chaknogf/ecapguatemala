# Configuración y secretos

Toda la configuración proviene de variables de entorno (leídas por
`pydantic-settings` en `backend/app/core/config.py`). La instalación crea
`~/.synvapp/.env` (Linux/macOS) o `%USERPROFILE%\.synvapp\.env` (Windows) con
permisos restringidos (0600 / NTFS `icacls`). **Nunca se versionan secretos**
(`.env*` está en `.gitignore`).

## Variables del backend

| Variable | Por defecto | Descripción |
|---|---|---|
| `DATABASE_URL` | — | `postgresql+psycopg://user:pass@host:5432/synvapp` |
| `ENVIRONMENT` | `development` | `production` exige secretos seguros y desactiva `/docs` |
| `DEBUG` | `false` | Debe ser falso en producción (arranque bloqueado si no) |
| `JWT_SECRET` | — | ≥32 chars; generar: `python -m app.cli secret` |
| `ACCESS_TOKEN_TTL_MINUTES` | 15 | Duración del token de acceso |
| `REFRESH_TOKEN_TTL_DAYS` | 14 | Vigencia de la sesión renovable |
| `PASSWORD_MIN_LENGTH` | 10 | Política Argon2id + mayúsc/minúsc/dígito |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES` | 5 / 15 | Bloqueo por intentos fallidos |
| `CORS_ORIGINS` | `["http://localhost:4200"]` | Lista JSON; restrinja por despliegue |
| `UPLOAD_DIR` / `BACKUP_DIR` / `MAX_UPLOAD_MB` | `data/uploads` etc. | Adjuntos (imágenes) |

En compose, `POSTGRES_*` alimentan al contenedor db y `SYNVAPP_HTTP_PORT`,
`SYNVAPP_API_PORT` controlan exposiciones.

## Políticas por empresa (configuración comercial, no global)

Se gestionan con `PATCH /api/v1/companies/current` (permiso
`configuracion.empresa.editar`):

- `inventory_policy`: `allow_negative` (falso por defecto),
  `valuation_method` (`weighted_average`|`fifo`), `block_sale_expired_lots`
  (verdadero por defecto).
- `expiry_policy`: `warn_days`, `critical_days` (semáforo de vencimientos;
  crítico < preventivo, ambos 1–3650).
- `currency_code`/`timezone`/`country_code`/`fiscal_profile` (p. ej. `GT_IVA`).
- `enabled_modules`: capacidades activadas.

Los valores admitidos se validan en el backend; claves desconocidas se rechazan.

## Roles y permisos de la instalación

`python -m app.cli create-admin --email …` crea o rota al administrador de
instalación (`is_platform_admin`, patrón de permiso `*` efectivo, sin rol por
empresa). Diferencia:

- **Admin técnico de instalación**: gestiona la plataforma (crea empresas,
  asigna `admin_empresa`). No registra ventas.
- **Admin de empresa**: gestiona lo comercial de su empresa con el rol sembrado
  automáticamente al crear la empresa.

La rotación de contraseña revoca todas las sesiones refresh del usuario
(operación auditada).

## Secretos fuera del repositorio

- `.env*`, `~/.synvapp/`, `server/data/*.db` y `.vercel/` están ignorados.
- `backend/.env` local de desarrollo no debe subirse jamás; `.env.example` es
  el template sin valores reales.
- Credenciales de Cloudflare quedan en `~/.cloudflared` (gestionadas por la
  herramienta oficial), no en el repositorio.
