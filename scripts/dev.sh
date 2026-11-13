#!/usr/bin/env bash
# Synvapp ERP — arranca backend FastAPI + frontend Angular en desarrollo.
#
#   ./scripts/dev.sh              # v1: FastAPI :8000 + Angular :4200  (recomendado)
#   ./scripts/dev.sh --legacy     # además del servidor legado Hono/SQLite :1337
#   ./scripts/dev.sh --no-browser # no abre el navegador
#   ./scripts/dev.sh --fresh      # recrea el entorno virtual Python
#
# Es idempotente: reutiliza backend/.venv si ya existe; crea y migra si falta.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND="$ROOT/backend"
VENV="$BACKEND/.venv"
PY="$VENV/bin/python"
LOGS="$ROOT/tmp/logs"

API_PORT="${SYNVAPP_API_PORT:-8000}"
WEB_PORT="${NG_PORT:-4200}"
LEGACY_PORT=1337

WITH_LEGACY=0; NO_BROWSER=0; FRESH=0
for a in "$@"; do
  case "$a" in
    --legacy) WITH_LEGACY=1 ;;
    --no-browser) NO_BROWSER=1 ;;
    --fresh) FRESH=1 ;;
    -h|--help) grep '^# ' "$0" | sed 's/^# //'; exit 0 ;;
    *) echo "Opción desconocida: $a (use --help)" >&2; exit 2 ;;
  esac
done

G='\033[0;32m'; C='\033[0;36m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
info(){ printf "${C}[dev]${N} %s\n" "$*"; }
ok(){   printf "${G} ✔${N} %s\n" "$*"; }
warn(){ printf "${Y} ⚠${N} %s\n" "$*"; }
err(){  printf "${R} ✖${N} %s\n" "$*"; }

mkdir -p "$LOGS"

# -------------------------------------------------- python + venv
ensure_python() {
  local cands=(python3.13 python3.12 python3.14 python3)
  local base=""
  for c in "${cands[@]}"; do
    if command -v "$c" >/dev/null 2>&1; then base="$c"; break; fi
  done
  [[ -n "$base" ]] || { err "Necesita Python 3.12–3.14 en el PATH."; exit 1; }

  if [[ $FRESH -eq 1 && -d "$VENV" ]]; then
    warn "Recreando entorno virtual (--fresh)…"
    rm -rf "$VENV"
  fi

  if [[ ! -x "$PY" ]]; then
    info "Creando entorno virtual con ${base}…"
    "$base" -m venv "$VENV" || { err "No se pudo crear el venv."; exit 1; }
  else
    info "Reutilizando backend/.venv."
  fi

  # El paquete de PyPI «jwt» (≠ PyJWT) sombrea el módulo y rompe el login
  # (AttributeError: module 'jwt' has no attribute 'encode'). Retirarlo si aparece.
  if "$PY" -c 'import jwt' 2>/dev/null && ! "$PY" -c 'import jwt; assert hasattr(jwt, "encode")' 2>/dev/null; then
    warn "Paquete rogue 'jwt' detectado en el venv (sombrea PyJWT); se retira."
    "$PY" -m pip uninstall -y jwt -q || true
    "$PY" -m pip install -q --force-reinstall pyjwt
  fi

  # Verificación de dependencias: repara un venv existente pero incompleto
  # (p. ej. creado sin instalar requirements) en cualquier de los dos casos.
  if ! "$PY" -c 'import fastapi, jwt, uvicorn, sqlalchemy, alembic, argon2, psycopg; assert hasattr(jwt, "encode")' 2>/dev/null; then
    info "Instalando dependencias backend (requiere Internet la primera vez)…"
    "$PY" -m pip install -q --upgrade pip
    "$PY" -m pip install -q -r "$BACKEND/requirements.txt" || { err "Fallo pip install."; exit 1; }
  fi
  ok "Entorno listo (uvicorn/jwt/fastapi importan desde el venv)."
}

# -------------------------------------------------- env + migraciones
create_dev_env() {
  local secret
  secret=$("$PY" -c 'import secrets;print(secrets.token_urlsafe(48))' 2>/dev/null || echo "dev-secret-cambiar-0123456789abcdef")
  umask 077
  cat > "$BACKEND/.env" <<EOF
DATABASE_URL=postgresql+psycopg://${USER}@localhost:5432/synvapp
JWT_SECRET=$secret
ENVIRONMENT=development
DEBUG=true
EOF
  info "Si PostgreSQL no usa trust local, edite backend/.env (usuario actual: ${USER}; base 'synvapp')."
}

ensure_env() {
  if [[ ! -f "$BACKEND/.env" ]]; then
    warn "Falta backend/.env — se crea uno de desarrollo con secreto aleatorio."
    create_dev_env
  elif grep -qE 'usuario:contrasena|REEMPLAZAR_CON' "$BACKEND/.env"; then
    warn "backend/.env contiene marcadores de plantilla (.env.example copiado sin editar)."
    warn "Se respalda en backend/.env.template.bak y se crea un .env de desarrollo."
    mv "$BACKEND/.env" "$BACKEND/.env.template.bak"
    create_dev_env
  fi
}

migrate() {
  ( cd "$BACKEND" && "$PY" -m alembic upgrade head ) >"$LOGS/alembic.log" 2>&1 \
    && ok "Esquema al día (alembic upgrade head)." \
    || { err "La migración falló (¿PostgreSQL corriendo? ¿existe la base?). Ver $LOGS/alembic.log"; sed 's/^/    /' "$LOGS/alembic.log" | tail -4; exit 1; }
}

# -------------------------------------------------- dependencias JS
RUN(){ # ejecuta pnpm o npm según disponibilidad
  if command -v pnpm >/dev/null 2>&1; then pnpm "$@"; else npm "$@"; fi
}

ensure_node() {
  if [[ ! -d "$ROOT/node_modules" ]]; then
    info "Instalando dependencias del frontend…"
    ( cd "$ROOT" && RUN install ) >"$LOGS/npm.log" 2>&1 \
      || { err "Fallo la instalación JS. Ver $LOGS/npm.log"; exit 1; }
    ok "Frontend listo."
  fi
}

# -------------------------------------------------- puertos
check_ports() {
  local port
  for port in "$API_PORT" "$WEB_PORT"; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      err "El puerto $port ya está ocupado. Libérelo o exporte SYNVAPP_API_PORT / NG_PORT."
      exit 1
    fi
  done
}

# -------------------------------------------------- arranque
PIDS=()
cleanup() {
  trap - INT TERM EXIT
  [[ ${#PIDS[@]} -gt 0 ]] || return 0
  echo; info "Deteniendo servicios…"
  for pid in "${PIDS[@]}"; do
    pkill -P "$pid" 2>/dev/null; kill "$pid" 2>/dev/null
  done
  pkill -P $$ 2>/dev/null
  # los procesos con --reload forkizan workers; mata por puerto (puertos verificados
  # libres al inicio, así que quien escucha ahí fue lanzado por este script)
  local lport lp
  for pass in 1 2; do
    for lport in "$API_PORT" "$WEB_PORT" $([[ $WITH_LEGACY -eq 1 ]] && echo "$LEGACY_PORT"); do
      for lp in $(lsof -t -nP -iTCP:"$lport" -sTCP:LISTEN 2>/dev/null); do
        pkill -P "$lp" 2>/dev/null; kill "$lp" 2>/dev/null
      done
    done
  done
  sleep 1
  wait 2>/dev/null
  ok "Servicios detenidos. (PostgreSQL no se toca.)"
}

start_all() {
  # backend FastAPI
  ( cd "$BACKEND" && exec "$PY" -m uvicorn app.main:app --reload --host 127.0.0.1 --port "$API_PORT" ) >"$LOGS/api.log" 2>&1 &
  PIDS+=($!); info "FastAPI → :$API_PORT"

  # frontend Angular (proxy /api/v1 -> :$API_PORT)
  if command -v pnpm >/dev/null 2>&1; then
    ( cd "$ROOT" && exec pnpm exec ng serve --port "$WEB_PORT" ) >"$LOGS/ng.log" 2>&1 &
  else
    ( cd "$ROOT" && exec ./node_modules/.bin/ng serve --port "$WEB_PORT" ) >"$LOGS/ng.log" 2>&1 &
  fi
  PIDS+=($!); info "Angular → :$WEB_PORT"

  # servidor legado opcional
  if [[ $WITH_LEGACY -eq 1 ]]; then
    ( cd "$ROOT" && exec npm run server:dev ) >"$LOGS/legacy.log" 2>&1 &
    PIDS+=($!); info "Legado Hono/SQLite → :$LEGACY_PORT"
  fi
}

wait_ready() {
  local name url pid i
  # espera a que la API responda
  for i in $(seq 1 40); do
    curl -fsS "http://127.0.0.1:$API_PORT/api/v1/health" >/dev/null 2>&1 && break
    kill -0 "${PIDS[0]}" 2>/dev/null || { err "FastAPI murió al arrancar:"; tail -6 "$LOGS/api.log" | sed 's/^/    /'; cleanup; exit 1; }
    sleep 0.5
  done
  if curl -fsS "http://127.0.0.1:$API_PORT/api/v1/health" >/dev/null 2>&1; then
    ok "FastAPI sana: http://127.0.0.1:$API_PORT/api/v1/health"
  else
    warn "FastAPI no respondió en el tiempo de espera (revisando $LOGS/api.log)."
  fi
  # espera al dev-server de Angular
  for i in $(seq 1 60); do
    curl -fsS "http://127.0.0.1:$WEB_PORT" >/dev/null 2>&1 && break
    sleep 1
  done
}

banner() {
  echo
  printf "${G}========================================================${N}\n"
  info "Synvapp ERP listo para desarrollo:"
  printf "   • App v1 (FastAPI+Angular):  ${C}http://localhost:%s${N}/v1/login\n" "$WEB_PORT"
  printf "   • API + Swagger (dev):       ${C}http://127.0.0.1:%s/api/v1/docs${N}\n" "$API_PORT"
  [[ $WITH_LEGACY -eq 1 ]] && printf "   • Demo legada:               ${C}http://localhost:%s/inventory${N}\n" "$WEB_PORT"
  printf "${G}========================================================${N}\n"
  printf "   Logs en ${Y}tmp/logs/${N} (api.log, ng.log%s).  Ctrl+C para detener todo.\n" "$([[ $WITH_LEGACY -eq 1 ]] && echo ', legacy.log')"
  echo
}

# -------------------------------------------------- main
command -v curl >/dev/null 2>&1 || { err "Falta curl (necesario para verificar salud)."; exit 1; }
command -v node >/dev/null 2>&1 || { err "Necesita Node.js 20+ en el PATH."; exit 1; }

ensure_python
ensure_env
migrate
ensure_node
check_ports
trap cleanup INT TERM EXIT
start_all
wait_ready
banner

if [[ $NO_BROWSER -eq 0 ]]; then
  ( sleep 1; open "http://localhost:$WEB_PORT" >/dev/null 2>&1 ) &
fi

# permanece hasta que un servicio termina (portable: bash 3.2 en macOS no tiene wait -n)
while :; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then warn "Un servicio terminó; cerrando el resto."; break 2; fi
  done
  sleep 2
done
