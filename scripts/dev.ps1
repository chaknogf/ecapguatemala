# Synvapp ERP — arranca FastAPI + Angular en desarrollo (Windows PowerShell 5.1+)
#
#   .\scripts\dev.ps1             # v1: FastAPI :8000 + Angular :4200
#   .\scripts\dev.ps1 -Legacy     # ademas el servidor legado Hono/SQLite :1337
#   .\scripts\dev.ps1 -NoBrowser
#   .\scripts\dev.ps1 -Fresh      # recrea .venv de Python
#
# Idempotente: reutiliza backend\.venv; crea .env y migra si faltan.
# Valido la sintaxis con el parser de PowerShell; la ejecucion fin a fin en
# Windows debe confirmarla el operador (no se declara probada donde no corre).
param(
  [switch]$Legacy,
  [switch]$NoBrowser,
  [switch]$Fresh,
  [int]$ApiPort = 8000,
  [int]$WebPort = 4200
)
$ErrorActionPreference = 'Stop'

$Root    = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Venv    = Join-Path $Backend '.venv'
$Py      = Join-Path $Venv 'Scripts\python.exe'
$Logs    = Join-Path $Root 'tmp\logs'
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

function Info($m){ Write-Host "[dev] $m" -ForegroundColor Cyan }
function Ok($m){   Write-Host " OK  $m" -ForegroundColor Green }
function Warn($m){ Write-Host " AV  $m" -ForegroundColor Yellow }
function Die($m){  Write-Host " ERR $m" -ForegroundColor Red; throw $m }

function Test-Port([int]$Port) {
  -not (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

# ------------------------------------------------ Python + venv
$pyBase = $null
foreach ($c in 'python','py') {
  $cmd = Get-Command $c -ErrorAction SilentlyContinue
  if ($cmd) { $pyBase = $c; break }
}
if (-not $pyBase) { Die 'Necesita Python 3.12-3.14 en el PATH.' }

if ($Fresh -and (Test-Path $Venv)) { Warn 'Recreando .venv (-Fresh)...'; Remove-Item -Recurse -Force $Venv }

if (-not (Test-Path $Py)) {
  Info 'Creando entorno virtual...'
  if ($pyBase -eq 'py') { & py -3 -m venv $Venv } else { & python -m venv $Venv }
  Info 'Instalando dependencias backend (primera vez requiere Internet)...'
  & $Py -m pip install -q --upgrade pip
  & $Py -m pip install -q -r (Join-Path $Backend 'requirements.txt')
  if ($LASTEXITCODE -ne 0) { Die 'Fallo pip install.' }
  Ok 'Entorno listo.'
} else {
  Info 'Reutilizando backend\.venv.'
}

# ------------------------------------------------ .env + migraciones
$envFile = Join-Path $Backend '.env'
if (-not (Test-Path $envFile)) {
  Warn 'Falta backend\.env — creando uno de desarrollo con secreto aleatorio.'
  $secret = & $Py -c 'import secrets;print(secrets.token_urlsafe(48))'
  @(
    'DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/synvapp'
    "JWT_SECRET=$secret"
    'ENVIRONMENT=development'
    'DEBUG=true'
  ) | Set-Content -Path $envFile -Encoding UTF8
  Warn "Ajuste DATABASE_URL si su PostgreSQL es otro (usuario/base: synvapp, y synvapp_test para pruebas)."
}

Info 'Aplicando migraciones (alembic upgrade head)...'
Push-Location $Backend
& $Py -m alembic upgrade head *>&1 | Out-File (Join-Path $Logs 'alembic.log') -Encoding utf8
$alembicOk = $LASTEXITCODE -eq 0
Pop-Location
if (-not $alembicOk) { Die 'La migracion fallo (¿PostgreSQL corriendo? ¿existe la base synvapp?). Ver tmp\logs\alembic.log' }
Ok 'Esquema al día.'

# ------------------------------------------------ Node + Angular
$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) { Die 'Necesita Node.js 20+ (npm).' }
if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
  Info 'Instalando dependencias del frontend...'
  Push-Location $Root; & npm install *>&1 | Out-File (Join-Path $Logs 'npm.log'); $npmOk = $LASTEXITCODE -eq 0; Pop-Location
  if (-not $npmOk) { Die 'Fallo npm install. Ver tmp\logs\npm.log' }
  Ok 'Frontend listo.'
}

if (-not (Test-Port $ApiPort)) { Die "Puerto $ApiPort ocupado. Use -ApiPort o libere el puerto." }
if (-not (Test-Port $WebPort)) { Die "Puerto $WebPort ocupado. Use -WebPort o libere el puerto." }

# ------------------------------------------------ arranque
$jobs = @()
Info "FastAPI -> :$ApiPort"
$jobs += Start-Process -PassThru -WindowStyle Hidden -FilePath $Py `
  -ArgumentList '-m','uvicorn','app.main:app','--reload','--host','127.0.0.1','--port',"$ApiPort" `
  -WorkingDirectory $Backend -RedirectStandardOutput (Join-Path $Logs 'api.log') -RedirectStandardError (Join-Path $Logs 'api.err.log')

Info "Angular -> :$WebPort"
$jobs += Start-Process -PassThru -WindowStyle Hidden -FilePath 'cmd.exe' `
  -ArgumentList '/c', "npx ng serve --port $WebPort > `"$Logs\ng.log`" 2>&1" `
  -WorkingDirectory $Root

if ($Legacy) {
  Info "Legado Hono/SQLite -> :1337"
  $jobs += Start-Process -PassThru -WindowStyle Hidden -FilePath 'cmd.exe' `
    -ArgumentList '/c', "npm run server:dev > `"$Logs\legacy.log`" 2>&1" `
    -WorkingDirectory $Root
}

function Stop-All {
  Write-Host ''
  Info 'Deteniendo servicios...'
  foreach ($j in $script:jobs) {
    try {
      if (-not $j.HasExited) {
        # el árbol hijo (ng/node) no muere con el padre: taskkill /T
        & taskkill.exe /T /F /PID $j.Id 2>$null | Out-Null
      }
    } catch {}
  }
  Ok 'Servicios detenidos (PostgreSQL no se toca).'
}

try {
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$ApiPort/api/v1/health" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    if ($jobs[0].HasExited) {
      Get-Content (Join-Path $Logs 'api.err.log') -Tail 8 | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
      throw 'FastAPI murio al arrancar (ver tmp\logs\api.err.log)'
    }
  }
  if ($ready) { Ok "FastAPI sano: http://127.0.0.1:$ApiPort/api/v1/health" } else { Warn 'FastAPI no confirmo salud (revisando logs).' }

  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    try { Invoke-WebRequest -Uri "http://localhost:$WebPort" -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch {}
  }

  Write-Host ''
  Write-Host '========================================================' -ForegroundColor Green
  Info "App v1:       http://localhost:$WebPort/v1/login"
  Info "API + Swagger: http://127.0.0.1:$ApiPort/api/v1/docs"
  if ($Legacy) { Info "Demo legada:  http://localhost:$WebPort/inventory" }
  Write-Host '========================================================' -ForegroundColor Green
  Write-Host "  Logs en tmp\logs\ — Ctrl+C para detener todo."
  Write-Host ''

  if (-not $NoBrowser) { Start-Process "http://localhost:$WebPort" }

  while ($true) {
    Start-Sleep -Seconds 2
    foreach ($j in $jobs) { if ($j.HasExited) { throw 'un-servicio-termino' } }
  }
} catch {
  if ($_.ToString() -ne 'un-servicio-termino') { Write-Host "ERR $($_.ToString())" -ForegroundColor Red }
  else { Warn 'Un servicio termino; cerrando el resto.' }
} finally {
  Stop-All
}
