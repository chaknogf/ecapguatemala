#!/usr/bin/env bash
# Synvapp ERP — instalador y herramienta de administración (Linux)
#
# Sinergia: install | start | stop | restart | status | logs | update |
#            backup | restore | configure | diagnose | admin | uninstall
#
# Requisitos: bash 4+, y uno de {podman (>=4) + podman-compose, docker (>=24)
# + docker compose}. Probado en este entorno únicamente en la lógica de
# detección (macOS como banco de pruebas de sintaxis); NO declarar
# compatibilidad Fedora/Debian/Ubuntu hasta ejecutar `install` en ellas.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
VERSION_FILE="$REPO_ROOT/VERSION"
APP_VERSION="$(cat "$VERSION_FILE" 2>/dev/null || echo 0.1.0)"
BASE_DIR="${SYNVAPP_HOME:-${HOME}/.synvapp}"
ENV_FILE="${BASE_DIR}/.env"
REPORT_FILE="${BASE_DIR}/install-report.txt"
COMPOSE_FILE="$REPO_ROOT/infra/compose.yml"

C_BLUE='\033[0;34m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[0;31m'; C_OFF='\033[0m'
log()  { printf "${C_BLUE}[synvapp]${C_OFF} %s\n" "$*"; }
ok()   { printf "${C_GREEN}✔${C_OFF} %s\n" "$*"; }
warn() { printf "${C_YELLOW}⚠${C_OFF} %s\n" "$*"; }
die()  { printf "${C_RED}✖ %s${C_OFF}\n" "$*" >&2; exit 1; }

detect_os() {
  [[ "$(uname -s)" == "Linux" ]] || die "Este instalador es para Linux. En Windows use scripts/synvapp.ps1."
  if [[ -r /etc/os-release ]]; then . /etc/os-release; else die "No se detectó /etc/os-release"; fi
  log "Sistema: ${PRETTY_NAME:-desconocido} ($(uname -m))"
}

# ---------------------------------------------------------------- runtime

RUNTIME=""        # podman | docker
COMPOSE_CMD=""    # podman-compose | docker compose

find_runtime() {
  if command -v podman >/dev/null 2>&1; then
    if command -v podman-compose >/dev/null 2>&1; then
      RUNTIME=podman; COMPOSE_CMD="podman-compose"; return 0
    fi
    if podman compose >/dev/null 2>&1 || (podman --version >/dev/null && command -v docker-compose >/dev/null 2>&1); then
      RUNTIME=podman; COMPOSE_CMD="podman compose"; return 0
    fi
    warn "podman presente pero falta podman-compose; intentaré docker-compose si existe."
  fi
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    RUNTIME=docker; COMPOSE_CMD="docker compose"; return 0
  fi
  return 1
}

require_runtime() {
  find_runtime && return 0
  cat <<'TXT' >&2
No se detectó un runtime compatible (Podman + podman-compose, o Docker + docker compose).

Instalación recomendada según distribución:
  Fedora:   sudo dnf install podman podman-compose
  Debian:   sudo apt-get install podman podman-compose    (o docker.io docker-compose-plugin)
  Ubuntu:   sudo apt-get install podman podman-compose    (o usar el repositorio oficial de Docker)
Reejecute: scripts/synvapp.sh install
TXT
  exit 1
}

compose() { ${COMPOSE_CMD} -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

runtime_running() {
  case "$RUNTIME" in
    podman) podman info >/dev/null 2>&1 ;;
    docker) docker info >/dev/null 2>&1 ;;
  esac
}

# ---------------------------------------------------------------- secretos

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -base64 48 | tr '/+' '_-'
  else od -An -N48 -tx1 /dev/urandom | tr -d ' \n'; fi
}

ensure_dirs() {
  mkdir -p "$BASE_DIR" "$BASE_DIR/backups" "$BASE_DIR/logs" "$BASE_DIR/cloudflare"
  chmod 700 "$BASE_DIR" "$BASE_DIR/cloudflare" 2>/dev/null || true
}

env_get() { # env_get <clave> [valor-por-defecto]
  local v
  v="$(grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2-)" || true
  [[ -n "$v" ]] && printf '%s' "$v" || printf '%s' "${2:-}"
}
env_set() {
  local k="$1" v="$2"
  if grep -qE "^${k}=" "$ENV_FILE"; then
    local tmp; tmp="$(mktemp)"
    sed -E "s|^${k}=.*|${k}=${v}|" "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$k" "$v" >> "$ENV_FILE"
  fi
}

# ---------------------------------------------------------------- install

cmd_install() {
  detect_os
  require_runtime
  log "Runtime de contenedores: $RUNTIME ($COMPOSE_CMD)"

  local http_port=8080 api_port=8000 mode=local domain=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --port) http_port="$2"; shift 2 ;;
      --api-port) api_port="$2"; shift 2 ;;
      --mode) mode="$2"; shift 2 ;;
      --domain) domain="$2"; shift 2 ;;
      *) die "Opción desconocida: $1" ;;
    esac
  done

  ensure_dirs
  if [[ -f "$ENV_FILE" ]]; then
    warn ".env existente en $ENV_FILE — NO se sobreescribe (se preserva su configuración)."
  else
    log "Generando $ENV_FILE con secretos aleatorios..."
    umask 077
    cat > "$ENV_FILE" <<EOF
# Synvapp ERP — configuración local (contiene secretos: permisos 0600)
ENVIRONMENT=production
DEBUG=false
POSTGRES_DB=synvapp
POSTGRES_USER=synvapp
POSTGRES_PASSWORD=$(gen_secret)
JWT_SECRET=$(gen_secret)
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=14
SYNVAPP_HTTP_PORT=${http_port}
SYNVAPP_API_PORT=${api_port}
CORS_ORIGINS=["http://localhost:${http_port}","http://127.0.0.1:${http_port}"]
EOF
    chmod 600 "$ENV_FILE"
    ok "Configuración creada."
  fi

  if ! runtime_running; then
    warn "El daemon de ${RUNTIME} no responde. En Fedora/Ubuntu sin root: active la unidad de usuario:"
    warn "  systemctl --user enable --now podman.socket   (o inicie Docker Desktop / el servicio docker)"
    die "No se puede contactar ${RUNTIME}. Solucione e intente de nuevo."
  fi

  log "Construyendo imágenes (requiere acceso a Internet la primera vez)..."
  compose build api 2>/dev/null || compose build || die "Fallo de build de imágenes"
  log "Arrancando servicios (PostgreSQL + migración + API)..."
  compose up -d db migrate
  compose up -d api

  log "Verificando salud..."
  local i=0
  until curl -fsS "http://127.0.0.1:${api_port}/api/v1/health" >/dev/null 2>&1; do
    i=$((i+1)); [[ $i -gt 60 ]] && die "La API no quedó sana en 60 intentos"
    sleep 2
  done
  ok "API sana en http://127.0.0.1:${api_port}/api/v1/health"

  case "$mode" in
    local) ;;
    lan) firewall_hint "$http_port";;
    caddy) configure_caddy "$domain" "$http_port" ;;
    tunnel) configure_tunnel "$http_port" ;;
    *) die "Modo desconocido: $mode (local|lan|caddy|tunnel)" ;;
  esac

  cat > "$REPORT_FILE" <<EOF
Synvapp ERP v${APP_VERSION} — reporte de instalación
Fecha: $(date -Is)
Runtime: $RUNTIME ($COMPOSE_CMD)
Directorio de datos: $BASE_DIR
Modo: $mode ${domain:+dominio: $domain}
Acceso local: http://127.0.0.1:${http_port}/ (web opcional) — API interna http://127.0.0.1:${api_port}/api/v1
Siguiente paso: scripts/synvapp.sh admin   (crear el primer administrador)
Postgres: SOLO red interna (sin puerto publicado)
EOF
  ok "Instalación registrada en $REPORT_FILE"

  printf '\n'
  log "============================== RESUMEN =============================="
  log "API:   http://127.0.0.1:${api_port}/api/v1/health"
  log "Nota:  la interfaz web v1 contra este backend está EN DESARROLLO (Fase 7);"
  log "       la app publicada actual consume el backend legado (Vercel/SQLite)."
  log "Cree el primer administrador con:"
  log "   scripts/synvapp.sh admin"
  log "===================================================================="
}

firewall_hint() {
  local port="$1"
  if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
    if [[ $EUID -eq 0 ]]; then
      firewall-cmd --permanent --add-port="${port}/tcp >/dev/null" || true
      firewall-cmd --reload >/dev/null || true
      ok "Puerto ${port} abierto en firewalld."
    else
      warn "Puerto ${port}: ejecute como root: sudo firewall-cmd --permanent --add-port=${port}/tcp && sudo firewall-cmd --reload"
    fi
  elif command -v ufw >/dev/null 2>&1 && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
    warn "Puerto ${port}: ejecute: sudo ufw allow ${port}/tcp"
  else
    log "Sin firewall activo detectado (o no consultable); revise la seguridad de red manualmente."
  fi
}

configure_caddy() {
  local domain="$1" http_port="$2"
  [[ -n "$domain" ]] || die "configure --mode caddy requiere --domain ejemplo.com"
  command -v caddy >/dev/null 2>&1 || die "Caddy no está instalado. Instálelo primero (documentado) o use --mode tunnel."

  # no sobrescribir: verificar ocupación de puertos
  if ss -ltn 2>/dev/null | grep -qE ':80 |:443 ' || netstat -ltn 2>/dev/null | grep -qE ':(80|444)\b'; then
    : # puede ser el propio caddy; se valida a continuación
  fi

  local fragment="/etc/caddy/conf.d/synvapp.caddyfile"
  local caddyfile="/etc/caddy/Caddyfile"
  sudo mkdir -p /etc/caddy/conf.d || die "No se pudo crear /etc/caddy/conf.d"
  if sudo test -f "$fragment"; then
    cp "$fragment" "${fragment}.bak.$(date +%s)" 2>/dev/null || true
    warn "Fragmento previo respaldado; se reescribirá solo el bloque de Synvapp."
  fi
  TMPF=$(mktemp)
  cat > "$TMPF" <<EOF
# Synvapp ERP — fragmento gestionado (no editar manualmente)
${domain} {
    reverse_proxy 127.0.0.1:${http_port}
}
EOF
  sudo cp "$TMPF" "$fragment"; rm -f "$TMPF"

  if sudo test -f "$caddyfile" && ! sudo grep -q "import conf.d" "$caddyfile"; then
    sudo cp "$caddyfile" "${caddyfile}.synvapp.bak"
    printf '\nimport /etc/caddy/conf.d/*\n' | sudo tee -a "$caddyfile" >/dev/null
    ok "Caddyfile respaldado (${caddyfile}.synvapp.bak) e import de conf.d agregado."
  fi

  if sudo caddy validate --config "$caddyfile" >/dev/null 2>&1; then
    sudo systemctl reload caddy 2>/dev/null || sudo caddy reload --config "$caddyfile" 2>/dev/null || warn "Recargue Caddy manualmente."
    if command -v curl >/dev/null && curl -fsS -o /dev/null -H "Host: ${domain}" "http://127.0.0.1/" 2>/dev/null; then
      ok "Caddy responde; verifique DNS y el certificado en https://${domain}."
    else
      warn "Caddy recargado. Compruebe que ${domain} apunta a este servidor (registro A/AAAA) y que 80/443 están expuestos."
    fi
  else
    warn "La validación de Caddy falló; NO se recargó. Revise: sudo caddy validate --config ${caddyfile} (fragmento en ${fragment})."
  fi
}

configure_tunnel() {
  local http_port="$1"
  command -v cloudflared >/dev/null 2>&1 || die "cloudflared no está instalado. Instalación documentada: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  local cdir="$BASE_DIR/cloudflare"
  if cloudflared tunnel list 2>/dev/null | grep -qw synvapp; then
    warn "Túnel 'synvapp' existente; se reutiliza (no se sobrescribe)."
  else
    log "Autenticación Cloudflare (se abrirá un navegador; se requiere cuenta):"
    cloudflared tunnel login || die "login cancelado"
    cloudflared tunnel create synvapp || die "No se pudo crear el túnel"
  fi
  local cred
  cred="$(ls "${cdir}"/*.json 2>/dev/null | head -1 || true)"
  # crear config sin pisar archivos de otros túneles
  local cfg="/etc/cloudflared/synvapp.yml"
  sudo mkdir -p /etc/cloudflared
  if [[ -f "$cfg" ]]; then warn "Configuración de túnel existente respaldada"; sudo cp "$cfg" "${cfg}.bak"; fi
  sudo tee "$cfg" >/dev/null <<EOF
tunnel: synvapp
credentials-file: ${HOME}/.cloudflared/*.json
ingress:
  - hostname: ${SYNVAPP_TUNNEL_HOSTNAME:-}
    service: http://127.0.0.1:${http_port}
  - service: http_status:404
EOF
  warn "Si usa hostname propio, configure DNS: cloudflared tunnel route dns synvapp SU_DOMINIO"
  warn "Sin hostname público el túnel sirve una URL temporal de trycloudflare con 'cloudflared tunnel --url http://127.0.0.1:${http_port}'."
  ok "Túnel configurado (servicio web; NO exponga Postgres ni el API por separado)."
}

# ---------------------------------------------------------------- administración

cmd_start()   { require_runtime; compose up -d; ok "Servicios iniciados."; }
cmd_stop()    { require_runtime; compose stop; ok "Servicios detenidos (datos conservados)."; }
cmd_restart() { cmd_stop; cmd_start; }
cmd_status()  { require_runtime; compose ps || true; runtime_running && ok "Runtime $RUNTIME operativo" || warn "Runtime $RUNTIME no responde"; }
cmd_logs()    { require_runtime; compose logs -f "${1:-api}"; }

cmd_admin() {
  require_runtime
  compose exec api python -m app.cli create-admin
}

cmd_backup() {
  require_runtime
  local ts db_name user_name
  ts="$(date +%Y%m%d-%H%M%S)"
  db_name="$(env_get POSTGRES_DB)"
  user_name="$(env_get POSTGRES_USER)"
  local dest="${BASE_DIR}/backups/synvapp-${ts}"
  mkdir -p "$dest"
  log "Respaldando base de datos (${db_name})..."
  compose exec -T db pg_dump -U "$user_name" -Fc "$db_name" > "$dest/database.dump" || die "pg_dump falló"
  log "Empaquetando volúmenes de datos (uploads/backups de la app)..."
  case "$RUNTIME" in
    podman) ${COMPOSE_CMD} run --rm --no-deps api tar -C /srv/synvapp/data -cf - . > "$dest/app-data.tar" 2>/dev/null ;;
    docker) compose run --rm --no-deps api tar -C /srv/synvapp/data -cf - . > "$dest/app-data.tar" ;;
  esac || warn "No se pudo exportar el volumen de datos (¿sin archivos?); se conservó el dump."
  # .env contiene secretos: 0600 y se advierte en el README
  cp "$ENV_FILE" "$dest/env.tar.gz.note" && rm "$dest/env.tar.gz.note"
  cp "$ENV_FILE" "$dest/.env.copy" && chmod 600 "$dest/.env.copy"
  ( cd "$dest" && sha256sum database.dump > checksums.txt ) 2>/dev/null || true
  ok "Respaldo en $dest"
  warn "El respaldo contiene secretos (.env.copy). Protélo o elimínelo si la política lo exige."
}

cmd_restore() {
  require_runtime
  local src="${1:-}"
  [[ -d "$src" && -f "$src/database.dump" ]] || die "Uso: synvapp.sh restore <directorio-de-respaldo> (debe contener database.dump)"
  printf "${C_RED}⚠ Restaurar REEMPLAZARÁ la base de datos actual de %s (los datos actuales se pierden).${C_OFF}\n" "$(env_get POSTGRES_DB)"
  read -r -p "Escriba RESTORE para continuar: " confirm
  [[ "$confirm" == "RESTORE" ]] || die "Cancelado."
  compose stop api
  compose exec -T db pg_restore -U "$(env_get POSTGRES_USER)" -d "$(env_get POSTGRES_DB)" --clean --if-exists < "$src/database.dump" || die "pg_restore falló"
  compose up -d api
  ok "Base de datos restaurada desde $src"
}

cmd_update() {
  require_runtime
  cmd_backup || die "El respaldo previo es obligatorio; falle la actualización"
  log "Reconstruyendo imágenes y migrando esquema..."
  compose build api 2>/dev/null || compose build
  compose up -d db migrate && compose up -d api
  local i=0
  until curl -fsS "http://127.0.0.1:$(env_get SYNVAPP_API_PORT)/api/v1/health" >/dev/null 2>&1; do
    i=$((i+1)); [[ $i -gt 60 ]] && die "API no quedó sana tras actualizar; revise logs: synvapp.sh logs"
    sleep 2
  done
  ok "Actualización completada con respaldo previo y migración aplicada."
}

cmd_configure() {
  local port="${1:-}"
  [[ -n "$port" ]] || die "Uso: synvapp.sh configure --mode local|lan|caddy|tunnel [--domain X]"
  cmd_install "$@"
}

cmd_diagnose() {
  detect_os
  printf '%-32s' "runtime:"
  if find_runtime; then ok "$RUNTIME ($COMPOSE_CMD)"; else warn "ninguno"; fi
  [[ -z "${RUNTIME:-}" ]] && die "diag: sin runtime"
  printf '%-32s' "daemon operativo:"
  runtime_running && ok "sí" || warn "no"
  printf '%-32s' "config:"; [[ -f "$ENV_FILE" ]] && ok "$ENV_FILE" || warn "ausente"
  printf '%-32s' "volúmenes:"; ${COMPOSE_CMD} volume ls 2>/dev/null | grep -q synvapp && ok "presentes" || warn "no encontrados"
  printf '%-32s' "contenedores:"; compose ps || true
  printf '%-32s' "salud API:"
  local port; port="$(env_get SYNVAPP_API_PORT 2>/dev/null || echo 8000)"
  curl -fsS "http://127.0.0.1:${port}/api/v1/health" >/dev/null 2>&1 && ok "http://127.0.0.1:${port}" || warn "sin respuesta"
  ok "Diagnóstico terminado."
}

cmd_uninstall() {
  require_runtime
  local purge=0
  [[ "${1:-}" == "--purge-data" ]] && purge=1
  compose down || true
  if [[ "$purge" == "1" ]]; then
    printf "${C_RED}⚠ --purge-data ELIMINA la base de datos y los adjuntos.${C_OFF}\n"
    read -r -p "Escriba PURGE para confirmar: " confirm
    [[ "$confirm" == "PURGE" ]] || die "Cancelado."
    compose down -v
    warn "Volúmenes eliminados. Configuración y respaldos en $BASE_DIR se conservan."
  else
    ok "Servicios retirados. Los datos (volúmenes + $BASE_DIR) se CONSERVAN por seguridad."
    log "Para eliminarlos definitivamente: synvapp.sh uninstall --purge-data"
  fi
}

usage() {
  cat <<EOF
Synvapp ERP ${APP_VERSION} — instalación y administración (Linux)

Modos de ejecución
  scripts/synvapp.sh install [--mode local|lan|caddy|tunnel] [--port N] [--api-port N] [--domain X]
  scripts/synvapp.sh start | stop | restart | status | logs [servicio] | admin
  scripts/synvapp.sh backup | restore <dir> | update | diagnose
  scripts/synvapp.sh configure --mode ... [--domain X]   (reconfigura exposición)
  scripts/synvapp.sh uninstall [--purge-data]

Requisitos mínimos: bash 4, curl, y podman+podman-compose o docker (con plugin compose).
El acceso público solo se abre si usted elige --mode lan/caddy/tunnel.
EOF
}

main() {
  local cmd="${1:-help}"; shift || true
  case "$cmd" in
    install) cmd_install "$@" ;;
    start) cmd_start "$@" ;;
    stop) cmd_stop "$@" ;;
    restart) cmd_restart "$@" ;;
    status) cmd_status "$@" ;;
    logs) cmd_logs "$@" ;;
    admin) cmd_admin "$@" ;;
    backup) cmd_backup "$@" ;;
    restore) cmd_restore "$@" ;;
    update) cmd_update "$@" ;;
    configure) cmd_configure "$@" ;;
    diagnose) cmd_diagnose "$@" ;;
    uninstall) cmd_uninstall "$@" ;;
    *) usage ;;
  esac
}

main "$@"
