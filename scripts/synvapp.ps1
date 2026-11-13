# Synvapp ERP — instalador y herramienta de administracion (Windows)
#
# Requisitos: Windows 10/11 x64, PowerShell 5.1+, y uno de:
#   - Docker Desktop (motor Linux) con WSL2, o
#   - Podman Desktop (machine) con podman-compose.
# Veridad de validacion: este guion fue escrito para el contrato de PowerShell 5.1;
# SU EJECUCION FIN A FIN DEBE VALIDARSE EN WINDOWS (no se afirma probado aqui).
#
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('install','start','stop','restart','status','logs','update','backup','restore','configure','diagnose','admin','uninstall')]
  [string]$Command,
  [string]$Mode = 'local',          # install|configure: local | lan | caddy | tunnel
  [string]$Domain = '',             # modo caddy
  [int]$HttpPort = 8080,
  [int]$ApiPort = 8000,
  [string]$Source = '',             # restore: carpeta de respaldo
  [string]$Service = 'api',         # logs: servicio
  [switch]$PurgeData                # uninstall: eliminar volumenes
)

$ErrorActionPreference = 'Stop'

function Write-Info([string]$m) { Write-Host "[synvapp] $m" -ForegroundColor Cyan }
function Write-Ok([string]$m)   { Write-Host "OK  $m" -ForegroundColor Green }
function Write-Warn([string]$m) { Write-Host "AV  $m" -ForegroundColor Yellow }
function Stop-Die([string]$m)   { Write-Host "ERROR $m" -ForegroundColor Red; exit 1 }

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BaseDir  = Join-Path $env:USERPROFILE '.synvapp'
$EnvFile  = Join-Path $BaseDir '.env'
$ComposeFile = Join-Path $RepoRoot 'infra\compose.yml'
$AppVersion  = '0.1.0'

# ---------------------------------------------------------------- deteccion

function Get-Runtime {
  $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
  if ($dockerCmd) {
    try {
      docker compose version | Out-Null
      return [pscustomobject]@{ Name = 'docker'; Compose = @('docker','compose') }
    } catch {
      $dc = Get-Command docker-compose -ErrorAction SilentlyContinue
      if ($dc) { return [pscustomobject]@{ Name='docker'; Compose=@('docker-compose') } }
    }
  }
  $podmanCmd = Get-Command podman -ErrorAction SilentlyContinue
  if ($podmanCmd) {
    $pc = Get-Command podman-compose -ErrorAction SilentlyContinue
    if ($pc) { return [pscustomobject]@{ Name = 'podman'; Compose = @('podman-compose') } }
    try {
      podman compose version | Out-Null
      return [pscustomobject]@{ Name='podman'; Compose=@('podman','compose') }
    } catch { }
  }
  return $null
}

function Test-RuntimeUp($rt) {
  try {
    if ($rt.Name -eq 'docker') { docker info | Out-Null } else { podman machine ls | Out-Null; podman info | Out-Null }
    return $true
  } catch { return $false }
}

function Assert-Os {
  if ($env:OS -notlike 'Windows*') { Stop-Die 'Este instalador es para Windows. En Linux use scripts/synvapp.sh.' }
  $arch = (Get-CimInstance Win32_OperatingSystem | Select-Object -Expand OSArchitecture)
  if ($arch -notmatch '64') { Stop-Die 'Se requiere Windows de 64 bits.' }
  Write-Info "Windows $($PSVersionTable.PSVersion) $arch detectado"
}

# ---------------------------------------------------------------- secretos

function New-Secret {
  # 48 bytes de entropia aleatoria, formato base64url
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}

function Get-EnvValue([string]$Key, [string]$Default = '') {
  if (Test-Path $EnvFile) {
    $line = Select-String -Path $EnvFile -Pattern "^$Key=" | Select-Object -Last 1
    if ($line) { return ($line.Line -split '=',2)[1] }
  }
  return $Default
}

function Set-EnvValue([string]$Key, [string]$Value) {
  $lines = @()
  if (Test-Path $EnvFile) { $lines = @(Get-Content $EnvFile) }
  $found = $false
  $out = foreach ($l in $lines) {
    if ($l -match "^$Key=") { $found = $true; "$Key=$Value" } else { $l }
  }
  if (-not $found) { $out += "$Key=$Value" }
  Set-Content -Path $EnvFile -Value $out -Encoding UTF8
}

function Ensure-Dirs {
  foreach ($d in @($BaseDir, (Join-Path $BaseDir 'backups'), (Join-Path $BaseDir 'logs'), (Join-Path $BaseDir 'cloudflare'))) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
  }
}

# ---------------------------------------------------------------- compose

function Invoke-ComposeRaw {
  param([string[]]$ComposeCmd, [string[]]$Args_)
  $full = @('-f', $ComposeFile, '--env-file', $EnvFile) + $Args_
  & $ComposeCmd[0] ($ComposeCmd[1..($ComposeCmd.Count-1)] + $full)
}

function Test-PortFree([int]$Port) {
  $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  return ($null -eq $conn)
}

# ---------------------------------------------------------------- install

function Install-Synvapp {
  Assert-Os
  $rt = Get-Runtime
  if (-not $rt) {
    Write-Host @'
No se detecto Docker (con plugin compose) ni Podman (con podman-compose).

Opciones de instalacion (documentadas, a su eleccion):
  1. Docker Desktop con WSL2:  winget install -e --id Docker.DockerDesktop
  2. Podman Desktop:           winget install -e --id RedHat.Podman-Desktop
Reejecute: .\scripts\synvapp.ps1 install
'@ -ForegroundColor Yellow
    Stop-Die 'Sin runtime compatible.'
  }
  Write-Ok "Runtime: $($rt.Name) ($($rt.Compose -join ' '))"

  Ensure-Dirs
  if (Test-Path $EnvFile) {
    Write-Warn "$EnvFile ya existe: NO se sobreescribe. Su configuracion y secretos quedan intactos."
  } else {
    Write-Info 'Generando archivo de configuracion con secretos aleatorios...'
    @(
      '# Synvapp ERP (contiene secretos: no comparta esta carpeta)'
      'ENVIRONMENT=production'
      'DEBUG=false'
      'POSTGRES_DB=synvapp'
      'POSTGRES_USER=synvapp'
      "POSTGRES_PASSWORD=$(New-Secret)"
      "JWT_SECRET=$(New-Secret)"
      'ACCESS_TOKEN_TTL_MINUTES=15'
      'REFRESH_TOKEN_TTL_DAYS=14'
      "SYNVAPP_HTTP_PORT=$HttpPort"
      "SYNVAPP_API_PORT=$ApiPort"
      "CORS_ORIGINS=[`"http://localhost:$HttpPort`",`"http://127.0.0.1:$HttpPort`"]"
    ) | Set-Content -Path $EnvFile -Encoding UTF8
    # ACL: restringir herencia y conceder control solo al usuario actual (icacls)
    $sid = (whoami).Trim()
    & icacls $EnvFile /inheritance:r /grant:r "${sid}:F" | Out-Null
    Write-Ok 'Configuracion creada y asegurada (icacls).'
  }

  # puertos
  if (-not (Test-PortFree $HttpPort)) {
    Write-Warn "El puerto $HttpPort esta ocupado por otra aplicacion. Elija --HttpPort distinto (no se tomara el puerto de otros)."
    if ($Mode -eq 'local') { Write-Warn 'Continuando en modo local; la API usa su propio puerto interno.' }
  }

  if (-not (Test-RuntimeUp $rt)) {
    Write-Host @'
El motor de contenedores no responde.
  Docker: inicie Docker Desktop (motor Linux) — o instale WSL2: wsl --install -d Ubuntu.
  Podman: inicie la maquina:  podman machine init; podman machine start  (o Podman Desktop).
Reejecute el comando despues de tener el motor activo.
'@ -ForegroundColor Yellow
    Stop-Die 'Motor de contenedores no operativo.'
  }

  Write-Info 'Construyendo imagenes (primera vez requiere Internet)...'
  Invoke-ComposeRaw $rt.Compose @('build','api') | Out-Null
  Write-Info 'Arrancando PostgreSQL + migracion + API...'
  Invoke-ComposeRaw $rt.Compose @('up','-d','db','migrate') | Out-Null
  Invoke-ComposeRaw $rt.Compose @('up','-d','api') | Out-Null

  $health = "http://127.0.0.1:$ApiPort/api/v1/health"
  $ok = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    try {
      $r = Invoke-WebRequest -Uri $health -UseBasicParsing -TimeoutSec 4
      if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
  }
  if (-not $ok) { Stop-Die "La API no respondio en $health (revise status/logs)" }
  Write-Ok "API sana: $health"

  switch ($Mode) {
    'local' { }
    'lan'   {
      $rule = "Synvapp-HTTP-$HttpPort"
      if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
        try {
          New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort $HttpPort -Action Allow | Out-Null
          Write-Ok "Firewall: regla $rule creada."
        } catch { Write-Warn "No se pudo crear la regla (ejecute PowerShell como administrador): New-NetFirewallRule -DisplayName '$rule' -Direction Inbound -Protocol TCP -LocalPort $HttpPort -Action Allow" }
      }
    }
    'caddy' {
      if (-not $Domain) { Stop-Die 'Modo caddy requiere -Domain ejemplo.com' }
      $caddy = Get-Command caddy -ErrorAction SilentlyContinue
      if (-not $caddy) { Stop-Die 'Caddy no instalado en PATH. Instale Caddy para Windows (choco/scoop/二进制) o use -Mode tunnel.' }
      $cfgPath = "$env:ProgramFiles\Caddy\Caddyfile"
      if (-not (Test-Path $cfgPath)) {
        $cfgPath = Join-Path $env:APPDATA 'Caddy\Caddyfile'
      }
      if (-not (Test-Path $cfgPath)) { Stop-Die "No se encontro Caddyfile (revisado: $env:ProgramFiles\Caddy y $env:APPDATA\Caddy). Indique su ruta manualmente y reintente." }
      Copy-Item $cfgPath "$cfgPath.synvapp.bak" -Force
      Write-Info "Caddyfile respaldado ($cfgPath.synvapp.bak)."
      if ((Get-Content $cfgPath -Raw) -match 'synvapp') { Write-Warn 'Ya existia un bloque Synvapp: se reemplaza el fragmento gestionado; revise el respaldo.' }
      Add-Content -Path $cfgPath -Value @"

# Synvapp ERP (agregado; no borre otros bloques existentes)
$Domain {
    reverse_proxy localhost:$HttpPort
}
"@
      & $caddy.Path validate --config $cfgPath
      if ($LASTEXITCODE -ne 0) { Stop-Die 'Validacion de Caddy fallo; NO se recargo. Revise $cfgPath.' }
      try { Restart-Service Caddy -ErrorAction Stop } catch { Write-Warn 'Recargue Caddy manualmente (caddy reload).' }
      Write-Ok "Fragmento Caddy para $Domain aplicado. Verifique DNS y https://$Domain"
    }
    'tunnel' {
      $cf = Get-Command cloudflared -ErrorAction SilentlyContinue
      if (-not $cf) { Stop-Die 'cloudflared no esta instalado. Descarguelo oficial (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) y reintente. No almacene credenciales en el repositorio.' }
      & $cf.Path tunnel login
      if ($LASTEXITCODE -ne 0) { Stop-Die 'login cancelado' }
      & $cf.Path tunnel create synvapp
      Write-Ok 'Tunele creado. Configure DNS/route si usa hostname propio: cloudflared tunnel route dns synvapp SU_DOMINIO'
      Write-Warn 'Exponga SOLO el servicio web local; nunca PostgreSQL. Credenciales en $env:USERPROFILE\.cloudflared (protegidas por el SO).'
    }
    default { Stop-Die "Modo desconocido: $Mode" }
  }

  $report = Join-Path $BaseDir 'install-report.txt'
  @(
    "Synvapp ERP v$AppVersion - reporte de instalacion"
    "Fecha: $(Get-Date -Format o)"
    "Runtime: $($rt.Name)"
    "Datos: $BaseDir"
    "Modo: $Mode $Domain"
    "API interna: http://127.0.0.1:$ApiPort/api/v1/health"
    "Siguiente paso: .\scripts\synvapp.ps1 admin (crear primer administrador)"
    'NOTA: la interfaz Angular v1 contra este backend esta EN DESARROLLO (Fase 7).'
  ) | Set-Content -Path $report -Encoding UTF8
  Write-Ok "Reporte: $report"
  Write-Host ''
  Write-Info '============================= RESUMEN ============================='
  Write-Info "Cree el administrador con:  .\scripts\synvapp.ps1 admin"
  Write-Info '==============================================================='
}

function Start-Synvapp  { $rt = Require-Rt; Invoke-ComposeRaw $rt.Compose @('up','-d') | Out-Null; Write-Ok 'Iniciado' }
function Stop-Synvapp   { $rt = Require-Rt; Invoke-ComposeRaw $rt.Compose @('stop') | Out-Null; Write-Ok 'Detenido (datos conservados)' }
function Restart-Synvapp{ Stop-Synvapp; Start-Synvapp }
function Status-Synvapp {
  $rt = Get-Runtime
  if (-not $rt) { Write-Warn 'Sin runtime compatible instalado'; return }
  Write-Info "Runtime: $($rt.Name)"
  Invoke-ComposeRaw $rt.Compose @('ps')
}
function Logs-Synvapp($svc) {
  $rt = Require-Rt
  if (-not $svc) { $svc = 'api' }
  Invoke-ComposeRaw $rt.Compose @('logs','--tail','200',$svc)
}
function Require-Rt {
  $rt = Get-Runtime
  if (-not $rt) { Stop-Die 'Sin runtime compatible (instale Podman o Docker primero).' }
  return $rt
}

function Admin-Synvapp {
  $rt = Require-Rt
  # crea un administrador con entrada interactiva dentro del contenedor (sin secretos en CLI)
  Invoke-ComposeRaw $rt.Compose @('exec','-it','api','python','-m','app.cli','create-admin')
}

function Backup-Synvapp {
  $rt = Require-Rt
  $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
  $dest = Join-Path $BaseDir "backups\synvapp-$ts"
  New-Item -ItemType Directory -Path $dest | Out-Null
  $user = Get-EnvValue 'POSTGRES_USER'; $db = Get-EnvValue 'POSTGRES_DB'
  Write-Info "Respaldando base de datos $db..."
  # pg_dump escribe DENTRO del contenedor y se copia fuera: evita corromper
  # bytes binarios con la conversión de texto de PowerShell (redirección >).
  Invoke-ComposeRaw $rt.Compose @('exec','db','sh','-c',"pg_dump -U $user -Fc $db > /tmp/synvapp-dump") | Out-Null
  Invoke-ComposeRaw $rt.Compose @('cp','db:/tmp/synvapp-dump', (Join-Path $dest 'database.dump')) | Out-Null
  if (-not (Test-Path (Join-Path $dest 'database.dump'))) { Stop-Die 'El respaldo no se generó (¿compose cp soportado? revíselo)' }
  Copy-Item $EnvFile (Join-Path $dest '.env.copy')
  $h = (Get-FileHash (Join-Path $dest 'database.dump') -Algorithm SHA256).Hash
  Set-Content -Path (Join-Path $dest 'checksums.txt') -Value "$h  database.dump"
  Write-Ok "Respaldo en $dest (checksum registrado)"
  Write-Warn 'El respaldo incluye secretos (.env.copy): proteja o elimine segun politica.'
}

function Restore-Synvapp([string]$Src) {
  $rt = Require-Rt
  if (-not $Src -or -not (Test-Path (Join-Path $Src 'database.dump'))) { Stop-Die 'Uso: -Command restore -Source <dir> (con database.dump)' }
  Write-Warn 'Restaurar REEMPLAZARA la base de datos actual.'
  $confirm = Read-Host 'Escriba RESTORE para continuar'
  if ($confirm -ne 'RESTORE') { Stop-Die 'Cancelado' }
  $user = Get-EnvValue 'POSTGRES_USER'; $db = Get-EnvValue 'POSTGRES_DB'
  Invoke-ComposeRaw $rt.Compose @('stop','api') | Out-Null
  Invoke-ComposeRaw $rt.Compose @('cp',(Join-Path $Src 'database.dump'),'db:/tmp/restore-dump') | Out-Null
  Invoke-ComposeRaw $rt.Compose @('exec','db','sh','-c',"pg_restore -U $user -d $db --clean --if-exists /tmp/restore-dump") | Out-Null
  Invoke-ComposeRaw $rt.Compose @('rm','-f','api') 2>$null | Out-Null
  Invoke-ComposeRaw $rt.Compose @('up','-d','api') | Out-Null
  Write-Ok 'Restauracion completada'
}

function Update-Synvapp {
  Backup-Synvapp
  $rt = Require-Rt
  Invoke-ComposeRaw $rt.Compose @('build','api') | Out-Null
  Invoke-ComposeRaw $rt.Compose @('up','-d','db','migrate') | Out-Null
  Invoke-ComposeRaw $rt.Compose @('up','-d','api') | Out-Null
  $api = Get-EnvValue 'SYNVAPP_API_PORT' '8000'
  $ok = $false
  for ($i=0; $i -lt 60; $i++) { Start-Sleep -Seconds 2; try { if ((Invoke-WebRequest "http://127.0.0.1:$api/api/v1/health" -UseBasicParsing -TimeoutSec 4).StatusCode -eq 200) { $ok=$true; break } } catch {} }
  if (-not $ok) { Stop-Die 'La API no quedo sana tras actualizar' }
  Write-Ok 'Actualizacion completa (respaldo previo + migracion)'
}

function Configure-Synvapp { Install-Synvapp }

function Diagnose-Synvapp {
  Assert-Os
  $rt = Get-Runtime
  if ($rt) { Write-Ok "Runtime: $($rt.Name)" } else { Write-Warn 'Runtime: ninguno'; return }
  if (Test-RuntimeUp $rt) { Write-Ok 'Motor operativo' } else { Write-Warn 'Motor NO operativo' }
  if (Test-Path $EnvFile) { Write-Ok "Config: $EnvFile" } else { Write-Warn 'Config: ausente' }
  $api = Get-EnvValue 'SYNVAPP_API_PORT' '8000'
  try {
    $r = Invoke-WebRequest "http://127.0.0.1:$api/api/v1/health" -UseBasicParsing -TimeoutSec 4
    Write-Ok "API: $($r.StatusCode) $api"
  } catch { Write-Warn "API: sin respuesta en $api" }
  Invoke-ComposeRaw $rt.Compose @('ps')
}

function Uninstall-Synvapp {
  $rt = Require-Rt
  Invoke-ComposeRaw $rt.Compose @('down') | Out-Null
  Write-Ok 'Servicios retirados. Los datos (volumenes + configuracion) se conservan.'
  if ($PurgeData) {
    Write-Warn 'Va a ELIMINAR la base de datos y adjuntos de forma irreversible.'
    $confirm = Read-Host 'Escriba PURGE para confirmar'
    if ($confirm -ne 'PURGE') { Stop-Die 'Cancelado' }
    Invoke-ComposeRaw $rt.Compose @('down','-v') | Out-Null
    Write-Warn 'Volumenes eliminados. Configuracion y respaldos en $BaseDir conservados.'
  }
}

switch ($Command) {
  'install'   { Install-Synvapp }
  'start'     { Start-Synvapp }
  'stop'      { Stop-Synvapp }
  'restart'   { Restart-Synvapp }
  'status'    { Status-Synvapp }
  'logs'      { Logs-Synvapp $Service }
  'update'    { Update-Synvapp }
  'backup'    { Backup-Synvapp }
  'restore'   { Restore-Synvapp $Source }
  'configure' { Configure-Synvapp }
  'diagnose'  { Diagnose-Synvapp }
  'admin'     { Admin-Synvapp }
  'uninstall' { Uninstall-Synvapp }
}
