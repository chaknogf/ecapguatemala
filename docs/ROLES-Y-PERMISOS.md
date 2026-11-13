# Roles y permisos (RBAC)

La autoridad es el **backend**: cada endpoint verifica un permiso y el patrón
se evalúa contra los roles del usuario en la empresa activa derivada del token
(los roles son globales a la empresa, no por sucursal; la sucursal se usa para
alcance documental). La UI puede ocultar acciones, pero eso no es seguridad.

## Semántica de patrones

`permission_patterns` admiten comodines al final de cada nivel. Un permiso
`X` se concede si algún patrón coincide:

- `catalogo.productos.leer` → exacto.
- `catalogo.*` → cubre `catalogo.cualquier.cosa` (prefijo por puntos).
- `*` → todo (administrador de instalación).

Implementación: `app/core/permissions.py` (`pattern_matches`).

## Permisos del sistema (extraídos del código con `require(...)`)

| Permiso | Protege |
|---|---|
| `usuarios.permisos.administrar` | listar/crear/editar usuarios de la empresa, asignar roles y sucursal, leer/crear/editar roles, catálogo de permisos |
| `configuracion.empresa.editar` | editar empresa, crear maestros (unidades/categorías/marcas/impuestos/atributos), métodos de pago, vendedores |
| `configuracion.empresa.leer` | (patrón base) |
| `configuracion.empresas.crear` | crear empresas (si no se es admin de instalación) |
| `configuracion.sucursales.editar` / `configuracion.bodegas.editar` | sucursales y bodegas |
| `catalogo.productos.leer` / `.crear` / `.editar` | catálogo, variantes, lookup, análisis de precios |
| `inventario.stock.leer` | existencias, lotes, semáforos, movimientos (lectura) |
| `inventario.movimientos.crear` | registrar entradas/salidas/ajustes |
| `inventario.transferencias.crear` | transferencias entre bodegas |
| `inventario.ajustes.aprobar` | ajustes con motivo y **reversos** (además exige `movimientos.crear`) |
| `inventario.kardex.leer` | kardex por producto |
| `lotes.editar` | crear/editar lotes (cuarentena, bloqueo, vencimiento) |
| `compras.*` (leer) / `compras.ordenes.crear` / `compras.ordenes.aprobar` / `compras.recepciones.registrar` | ciclo de compras |
| `proveedores.*` | alta/edición de proveedores |
| `clientes.leer` / `clientes.*` | CRM |
| `ventas.pedidos.leer` / `.crear` / `ventas.despachos.*` / `ventas.facturas.emitir` / `ventas.facturas.leer` / `ventas.pagos.*` / `ventas.descuentos.autorizar` | ciclo de ventas |
| `fiscal.*` / `fiscal.impuestos.leer` | impuestos |
| `reportes.dashboard.leer` | panel de indicadores |
| `auditoria.registros.leer` | bitácora de auditoría |
| `contabilidad.*` | (Fase 6, reservado) |

## Roles sembrados por empresa (`BUILTIN_ROLES`)

| Rol | Patrones | Perfil de uso |
|---|---|---|
| `admin_instalacion` | `*` (flag `is_platform_admin`) | Técnico de la instalación; crea empresas |
| `admin_empresa` | configuracion/usuarios/catalogo/inventario/compras/ventas/caja/contabilidad/reportes/auditoria/fiscal/lotes `.*` | Dueño/gestor de la empresa |
| `gerente` | reportes, catálogo, inventario, compras, ventas, clientes, proveedores, dashboard, auditoría lectura, config lectura | Aprueba y supervise |
| `contador` | contabilidad.*, reportes.*, caja.*, fiscal.*, facturas lectura, stock lectura, catálogo lectura, auditoría lectura, dashboard | Áreas financieras |
| `vendedor` | catálogo lectura, stock lectura, pedidos/cotizaciones, clientes, reportes.ventas, dashboard | Frente comercial |
| `cajero` | caja.*, dashboard, facturas lectura, pagos, clientes lectura | Cobro |
| `bodeguero` | catálogo lectura, stock.*, movimientos, transferencias, dashboard, recepciones, preparar despacho, lotes.* | Almacén |
| `despachador` | stock lectura, dashboard, despachos, pedidos lectura | Preparación/salida |
| `compras` | dashboard, catálogo lectura, stock lectura, compras.*, proveedores, reportes.compras | Abastecimiento |
| `auditor` | auditoría lectura, reportes.*, contabilidad lectura (reportes/libros), kardex, stock, catálogo, dashboard | Solo lectura amplia |
| `consulta` | catálogo lectura, stock lectura, kardex, dashboard | Consulta sin operación |

**Doble control intencional:** un `bodeguero` puede registrar recepciones y
movimientos pero no aprobar ajustes ni cancelar documentos; aprobar OC exige
`compras.ordenes.aprobar`; revertir un movimiento exige
`inventario.ajustes.aprobar`; los usuarios nuevos nacen con
`must_change_password=true` (el sistema bloquea el resto de rutas hasta el
cambio).

## Roles de empresa modificables

Los roles sembrados son `system_role=true` y **no se editan** (se rechaza).
Para excepciones: `POST /api/v1/roles` con `code`, `name` y
`permission_patterns` validadas (`^[a-z_]+(\.[a-z_*0-9]+){1,4}`), y se asignan
con `PATCH /api/v1/users/{id} {"role_codes":[...]}`. Cambios de permisos y
asignaciones quedan auditados en `audit_log`.

## Acciones sensibles auditadas

login/login_failed/select_company/change_password, usuarios.crear/editar/
roles.crear/roles.editar/sucursal_asignar, configuracion.empresa.editar,
sucursales/bodegas editar, lotes.crear/editar, inventario.* (por tipo),
transferencias, reversos, conciliaciones, compras.proveedores/ordenes
(crear/aprobar/cancelar/recepciones), ventas (pedidos crear/confirmar/
cancelar, despachos, facturas emitir, pagos registrar), clientes/audit.

## Explorar desde la API

- `GET /api/v1/permissions/catalog` → patrones conocidos (orientativo para UI).
- Verificación práctica de aislamiento: un token de empresa A devuelve 404 para
  id de empresa B en cualquier lectura (el filtro se deriva del token), y 403
  cuando el rol no tiene el permiso.
