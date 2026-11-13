# Instalación en Windows y Linux

Herramientas: `scripts/synvapp.ps1` (Windows) y `scripts/synvapp.sh` (Linux).
Ambas son instalador, configurador, actualizador, verificador y desinstalador.

> **Estado de validación**: los instaladores implementan toda la lógica
> (detección de SO/arquitectura, runtime, puertos, secretos, migraciones,
> salud, respaldo, restauración). Este repositorio se desarrolló en macOS sin
> Podman/Docker disponible, por lo que **la ejecución fin a fin en Windows 10/11
> y en Fedora/Debian/Ubuntu está pendiente de validación** por el operador. Los
> requisitos y fallos se detectan y reportan; el instalador no declara éxito sin
> verificar salud de la API.

## Requisitos

- Windows 10/11 64-bit o Linux (Fedora, Debian, Ubuntu; systemd no es obligatorio
  para el modo de usuario).
- Podman ≥ 4 con `podman-compose`, o Docker ≥ 24 con el plugin `docker compose`.
- 2 GB de RAM para la pila, ~10 GB de disco para imágenes + datos.

## Instalación local (recomendada para empezar)

**Windows (PowerShell, desde la raíz del repositorio):**

```powershell
.\scripts\synvapp.ps1 install                       # modo local, puerto 8080
.\scripts\synvapp.ps1 install -HttpPort 8081        # si 8080 está ocupado
.\scripts\synvapp.ps1 admin                          # primer administrador
.\scripts\synvapp.ps1 status
```

Sin permisos de administrador: use un puerto alto (>1024), omita la creación de
reglas de firewall (el instalador lo intenta y avisa si no puede) y ejecute con
Docker Desktop o Podman Desktop en modo usuario.

**Linux:**

```bash
./scripts/synvapp.sh install
./scripts/synvapp.sh admin
```

Qué hace el instalador (documentado y ejecutado en orden):

1. Detecta SO y arquitectura; verifica `bash`/PowerShell.
2. Busca runtime (prefiere Podman; acepta Docker). Si no hay, muestra el
   comando de instalación por distribución **y aborta** (no simula éxito).
3. Verifica que el daemon responde (podman.socket de usuario / Docker Desktop).
4. Crea `~/.synvapp` (solo su usuario) con `backups/`, `logs/`, `cloudflare/`.
5. Si no existe `~/.synvapp/.env`, lo genera con secretos criptográficamente
   aleatorios (`POSTGRES_PASSWORD`, `JWT_SECRET`) y permisos 0600/NTFS; **si
   existe, NO lo toca** (se preserva y respeta su configuración).
6. Comprueba conflictos de puertos antes de exponer nada.
7. Construye las imágenes locales, arranca `db → migrate (alembic upgrade head)
   → api` y hace hasta 60 sondeos de `/api/v1/health`.
8. Escribe `~/.synvapp/install-report.txt` con resumen y próximos pasos.
9. PostgreSQL **no expone puerto**; la API solo escucha en loopback; el
   `web` (perfil opcional) publica únicamente el proxy nginx → API.

## Modos de exposición

```bash
./scripts/synvapp.sh install --mode lan                    # LAN: firewall/documenta
./scripts/synvapp.sh install --mode caddy --domain erp.miempresa.com
./scripts/synvapp.sh install --mode tunnel                 # Cloudflare Tunnel
```

- **local**: solo `http://127.0.0.1:8080`.
- **lan**: mantiene local + abre el puerto en firewalld/ufw (con consentimiento)
  o imprime el comando exacto si no hay permisos.
- **caddy**: detecta Caddy instalado, puertos 80/443 ocupados y Caddyfile
  existente; escribe un **fragmento** en `conf.d` (no sobrescribe el Caddyfile
  de otras aplicaciones), lo respalda, `caddy validate` antes de recargar y
  recuerda los registros DNS necesarios.
- **tunnel**: reutiliza un túnel `synvapp` existente si lo hay (no lo pisa);
  pide `cloudflared login` (no se guardan credenciales en el repositorio);
  expone solo el servicio web. Sin dominio propio puede usarse la URL temporal
  `trycloudflare`. Distingue dominio registrado ≠ DNS ≠ certificado ≠ túnel:
  la verificación de salud se hace contra el origen real.
- **detrás de un proxy existente**: no instale caddy/tunnel; apunte su proxy al
  `api` en la red interna (`http://api:8000`) o al puerto loopback publicado.

## Comandos de administración

| Comando | Efecto |
|---|---|
| `install` / `configure --mode …` | Instalar o reconfigurar exposición |
| `start` / `stop` / `restart` | Ciclo de vida (los datos se conservan) |
| `status` / `logs [api|db]` | Estado y trazas |
| `update` | **Backup previo obligatorio** → rebuild → migraciones → sondeo de salud |
| `backup` / `restore <dir>` | Dump `pg_dump -Fc` + checksums; restauración con confirmación `RESTORE` |
| `admin` | Crear/rotar el administrador (entrada interactiva, no en argumentos) |
| `diagnose` | Runtime, daemon, configuración, volúmenes, contenedores, salud |
| `uninstall [--purge-data]` | Retira servicios; **por defecto conserva datos**; `--purge-data` pide confirmación `PURGE` |

## systemd (Linux, opcional)

Para arrancar con el sistema, active el socket de usuario y una unidad:

```bash
systemctl --user enable --now podman.socket
# ejemplo de unidad (podman generate systemd --new --name synvapp-api)
```

El instalador no crea unidades automáticamente para no interferir con
configuraciones existentes del operador.

## Windows sin Docker/Podman

No hay modo "sin contenedores" soportado por el instalador (es requisito de
aislamiento del producto). Alternativa: ejecutar backend y frontend
manualmente con PostgreSQL nativo (ver `docs/DESARROLLO.md`) — operación no
recomendada para producción.
