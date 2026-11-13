# Respaldos, restauración y actualizaciones

## Qué se respalda

1. **Base de datos PostgreSQL** — `pg_dump -Fc` (formato custom, comprime y
   permite restauración selectiva).
2. **Archivos de la aplicación** — adjuntos/imágenes y backups internos bajo
   `data/` del volumen `synvapp_data` (tar del volumen).
3. **Configuración** — copia de `~/.synvapp/.env`. **Atención:** contiene
   secretos (`JWT_SECRET`, `POSTGRES_PASSWORD`). Si la política de la empresa
   lo exige, no copie `.env` junto al dump o cifre el respaldo
   (`gpg -c` / `cipher` en Windows). El comando lo advierte explícitamente.

## Procedimiento (instalador)

```bash
./scripts/synvapp.sh backup        # Linux  → ~/.synvapp/backups/synvapp-<fecha>/
```

```powershell
.\scripts\synvapp.ps1 backup       # Windows
```

En Windows el dump se escribe **dentro del contenedor** y se extrae con
`compose cp` (la redirección `>` de PowerShell corrompería bytes binarios).
Cada respaldo incluye `checksums.txt` (SHA-256 del dump).

## Restauración comprobable

```bash
./scripts/synvapp.sh restore ~/.synvapp/backups/synvapp-20261027-120000
# pide confirmación escrita: RESTORE
```

Secuencia: detiene `api` → `pg_restore --clean --if-exists` → arranca `api` →
el operador verifica `/api/v1/health` y una lectura de datos conocida.
Documente la prueba de restauración (fecha, respaldador, resultado) — un backup
no probado no es un backup.

## Rotación sugerida

- Diarios 7, semanales 4, mensuales 12 — `find … -mtime +N -delete` en cron,
  en un directorio distinto al de producción y con verificación de hash antes
  de borrar.

## Actualizaciones

```bash
./scripts/synvapp.sh update    # o synvapp.ps1 update
```

1. Ejecuta `backup` **obligatorio** (aborta si falla).
2. Reconstruye imágenes y aplica `alembic upgrade head` en el servicio
   `migrate` (si una migración es irreversible el proceso falla de forma
   segura y se conserva el contenedor anterior para rollback).
3. Espera `/api/v1/health` antes de declarar éxito (no basta que los
   contenedores "arrancaron").

## Recuperación de un update fallido

```bash
./scripts/synvapp.sh stop
# restaurar el dump previo sobre una base limpia (mismo comando restore)
./scripts/synvapp.sh start
```

## Modo desarrollo (sin contenedores)

```bash
pg_dump -U synvapp -Fc synvapp > respaldo.dump
pg_restore -U synvapp -d synvapp --clean --if-exists respaldo.dump
```
