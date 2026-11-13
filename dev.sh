#!/usr/bin/env bash
# ==========================================================================
# ECAP CRM Académico — ciclo de vida de los servicios de desarrollo.
#
#   ./dev.sh start            Levanta backend (8000) y frontend (4200).
#   ./dev.sh stop             Detiene ambos servicios.
#   ./dev.sh restart          Reinicia ambos.
#   ./dev.sh status           Muestra estado, PIDs y puertos.
#   ./dev.sh logs [servicio]  Sigue los logs (backend | frontend).
#
# Los PID y logs viven en .run/ (ignorado por git).
# ==========================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_LOG="$RUN_DIR/frontend.log"
BACKEND_PORT=8000
FRONTEND_PORT=4200
BACKEND_HEALTH="http://127.0.0.1:${BACKEND_PORT}/api/v1/health"
FRONTEND_URL="http://localhost:${FRONTEND_PORT}"
UVICORN="$ROOT/backend/.venv/bin/uvicorn"

mkdir -p "$RUN_DIR"

info() { printf '%s\n' "$*"; }
warn() { printf 'Aviso: %s\n' "$*" >&2; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Uso: ./dev.sh <comando>

  start            Levanta backend (8000) y frontend (4200).
  stop             Detiene ambos servicios.
  restart          Reinicia ambos.
  status           Muestra estado, PIDs y puertos.
  logs [servicio]  Sigue los logs: backend, frontend o all (por defecto).
  help             Muestra esta ayuda.

Los PID y logs viven en .run/ (ignorado por git).
EOF
}

read_pid() {
  local file="$1"
  [[ -f "$file" ]] && tr -d '[:space:]' < "$file" || true
}

pid_alive() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

port_pids() {
  lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

kill_tree() {
  local pid="$1" sig="${2:-TERM}" child
  [[ -n "$pid" ]] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child" "$sig"
  done
  kill "-$sig" "$pid" 2>/dev/null || true
}

wait_http() {
  local url="$1" tries="${2:-30}" i
  for ((i = 1; i <= tries; i++)); do
    if curl -fsS -o /dev/null --max-time 2 "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_port_free() {
  local port="$1" tries="${2:-10}" i
  for ((i = 1; i <= tries; i++)); do
    [[ -z "$(port_pids "$port")" ]] && return 0
    sleep 1
  done
  return 1
}

check_environment() {
  [[ -f "$ROOT/backend/.env" ]] || warn "falta backend/.env; copie backend/.env.example"
  [[ -x "$UVICORN" ]] || fail "no existe $UVICORN. Cree el venv del backend (README §5.2)."
  command -v pnpm >/dev/null 2>&1 || fail "pnpm no está instalado o no está en el PATH."
  if command -v pg_isready >/dev/null 2>&1; then
    pg_isready -d ecap >/dev/null 2>&1 || warn "PostgreSQL no responde para la base 'ecap'."
  fi
}

start_backend() {
  if [[ -n "$(port_pids "$BACKEND_PORT")" ]]; then
    info "Backend ya está escuchando en :$BACKEND_PORT (PID $(port_pids "$BACKEND_PORT" | tr '\n' ' '))."
    return 0
  fi

  info "Levantando backend en http://127.0.0.1:$BACKEND_PORT ..."
  (
    cd "$ROOT/backend"
    nohup "$UVICORN" app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" \
      >"$BACKEND_LOG" 2>&1 &
    printf '%s\n' "$!" >"$BACKEND_PID_FILE"
  )

  if wait_http "$BACKEND_HEALTH" 40; then
    info "Backend listo (PID $(read_pid "$BACKEND_PID_FILE")). Log: .run/backend.log"
  else
    warn "el backend no respondió en 40 s. Revise .run/backend.log"
    tail -n 20 "$BACKEND_LOG" 2>/dev/null || true
    return 1
  fi
}

start_frontend() {
  if [[ -n "$(port_pids "$FRONTEND_PORT")" ]]; then
    info "Frontend ya está escuchando en :$FRONTEND_PORT (PID $(port_pids "$FRONTEND_PORT" | tr '\n' ' '))."
    return 0
  fi

  info "Levantando frontend en $FRONTEND_URL ..."
  (
    cd "$ROOT"
    nohup pnpm start >"$FRONTEND_LOG" 2>&1 &
    printf '%s\n' "$!" >"$FRONTEND_PID_FILE"
  )

  if wait_http "$FRONTEND_URL" 90; then
    info "Frontend listo (PID $(read_pid "$FRONTEND_PID_FILE")). Log: .run/frontend.log"
  else
    warn "el frontend no respondió en 90 s. Revise .run/frontend.log"
    tail -n 20 "$FRONTEND_LOG" 2>/dev/null || true
    return 1
  fi
}

stop_one() {
  local name="$1" pid_file="$2" port="$3" pid
  pid="$(read_pid "$pid_file")"

  if pid_alive "$pid"; then
    info "Deteniendo $name (PID $pid) ..."
    kill_tree "$pid" TERM
    # Dar tiempo a que libere el puerto antes del respaldo por puerto.
    wait_port_free "$port" 5 || true
  fi

  # Respaldo: cualquier proceso que siga escuchando en el puerto.
  local leftovers
  leftovers="$(port_pids "$port")"
  if [[ -n "$leftovers" ]]; then
    info "Cerrando procesos restantes de $name en :$port ($(echo "$leftovers" | tr '\n' ' ')) ..."
    for leftover in $leftovers; do
      kill_tree "$leftover" TERM
    done
  fi

  rm -f "$pid_file"

  if ! wait_port_free "$port" 10; then
    warn "$name sigue ocupando :$port; forzando cierre."
    for leftover in $(port_pids "$port"); do
      kill_tree "$leftover" KILL
    done
    wait_port_free "$port" 5 || warn "no se pudo liberar :$port"
  fi
}

cmd_start() {
  check_environment
  start_backend
  start_frontend
  info ""
  info "Servicios activos:"
  info "  API      http://127.0.0.1:$BACKEND_PORT/api/v1/docs"
  info "  App      $FRONTEND_URL"
  info "  Logs     .run/backend.log · .run/frontend.log"
}

cmd_stop() {
  stop_one "frontend" "$FRONTEND_PID_FILE" "$FRONTEND_PORT"
  stop_one "backend" "$BACKEND_PID_FILE" "$BACKEND_PORT"
  info "Servicios detenidos."
}

cmd_restart() {
  cmd_stop
  cmd_start
}

cmd_status() {
  local bpid fpid
  bpid="$(read_pid "$BACKEND_PID_FILE")"
  fpid="$(read_pid "$FRONTEND_PID_FILE")"

  if pid_alive "$bpid"; then
    info "backend   activo   PID $bpid   :$BACKEND_PORT"
  elif [[ -n "$(port_pids "$BACKEND_PORT")" ]]; then
    info "backend   activo   PID $(port_pids "$BACKEND_PORT" | tr '\n' ' ')   :$BACKEND_PORT (sin PID file)"
  else
    info "backend   detenido :$BACKEND_PORT"
  fi

  if pid_alive "$fpid"; then
    info "frontend  activo   PID $fpid   :$FRONTEND_PORT"
  elif [[ -n "$(port_pids "$FRONTEND_PORT")" ]]; then
    info "frontend  activo   PID $(port_pids "$FRONTEND_PORT" | tr '\n' ' ')   :$FRONTEND_PORT (sin PID file)"
  else
    info "frontend  detenido :$FRONTEND_PORT"
  fi

  if wait_http "$BACKEND_HEALTH" 1; then
    info "health    ok       $BACKEND_HEALTH"
  else
    info "health    sin respuesta"
  fi
}

cmd_logs() {
  local target="${1:-all}"
  case "$target" in
    backend) exec tail -n 50 -f "$BACKEND_LOG" ;;
    frontend) exec tail -n 50 -f "$FRONTEND_LOG" ;;
    all) exec tail -n 30 -f "$BACKEND_LOG" "$FRONTEND_LOG" ;;
    *) fail "servicio desconocido: $target (use backend, frontend o all)" ;;
  esac
}

case "${1:-}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_restart ;;
  status) cmd_status ;;
  logs) cmd_logs "${2:-all}" ;;
  -h | --help | help | "") usage ;;
  *) usage; exit 1 ;;
esac
