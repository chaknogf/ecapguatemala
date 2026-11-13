# Módulos y reglas de negocio

Resumen del comportamiento garantizado por el backend (cada regla citada tiene
prueba automatizada).

## Identidad y control de acceso (`modules/identity`)
- Registro público inexistente; el acceso nace del `create-admin` o de un
  administrador con `usuarios.permisos.administrar`.
- Argon2id (t=3, m=64 MiB, p=2); política de contraseña (≥10, mayúsc/minúsc/
  dígito) validada en backend; rehash transparente al iniciar sesión.
- Access JWT HS256 15 min con `cid` (empresa) y patrones de permisos embebidos;
  refresh opaco de un solo uso con rotación; reuso ⇒ revocación de toda la
  familia de sesiones; logout revoca; cambio de contraseña revoca sesiones.
- Bloqueo tras 5 intentos fallidos (15 min), medible y auditado.
- Usuarios recién creados: `must_change_password` ⇒ todas las rutas de negocio
  devuelven 403 hasta el cambio.

## Empresas y configuración (`modules/tenancy`)
- Empresa: datos fiscales, moneda ISO, timezone IANA, país, perfil fiscal,
  políticas JSONB validadas por clave (políticas desconocidas se rechazan),
  módulos habilitados.
- Sucursal crea bodega `ALM-01` automáticamente; bodegas con política propia de
  negativo.
- Al crear empresa se siembran los 10 roles de empresa.

## Catálogo (`modules/catalog`)
- Tipos: `finished|raw|service|package|kit`; servicio no controla lotes/series.
- Unidades con conversiones por uso (stock/compra/venta) y factor > 0.
- Variantes con SKU/código de barras/existencia propios; barcode único por
  empresa en `product_barcode` (también para variantes).
- Datos adicionales (`extra_attrs` JSONB) validados contra `attribute_def`
  (tipo, enum, obligatoriedad por escopo empresa/categoría/tipo).
- Precios: costo, venta, mayorista, minorista, mínimo; modo de margen
  (sobre precio / recargo sobre costo); objetivo <100%; márgenes calculados con
  las fórmulas del pliego, `Decimal`, redondeo a centavo, divisiones por cero
  bloqueadas (`POST /catalog/pricing/analyze`).

## Inventario (`modules/inventory`)
- Saldo materializado `stock_item` por (producto, variante, bodega, lote),
  actualizado SOLO dentro de la transacción que inserta la línea de movimiento,
  con `SELECT … FOR UPDATE`. Concurrencia probada: dos salidas simultáneas sobre
  1 unidad ⇒ una gana, otra 409.
- Movimientos inmutables (sin UPDATE/DELETE); tipos con signo: receipt, sale,
  return_*, transfer_*, adjustment (firmado, motivo obligatorio), count,
  production_*, damage, expired, reversal.
- Reversos: línea `REVERSAL` que referencia la original; doble reverso ⇒ 409;
  revertir una recepción consumida ⇒ 409 (orden correcto de corrección).
- No negativo por defecto (servicio + `InsufficientStockError` 409); las
  excepciones por política/almacén son explícitas y auditables.
- Lotes: número único por producto/variante; vencimiento obligatorio si el
  producto lo exige; estados active/quarantine/blocked/depleted/expired;
  venta de lote vencido/bloqueado ⇒ 422 `expired_lot` según
  `block_sale_expired_lots` (default verdadero); FEFO (`fefo_allocation` y
  `auto_pick=fefo` en la API).
- Reservas documentales por lote (`stock_reservation`, invariante:
  Σ reservas activas == `reserved_qty`); disponible = físico − reservado;
  reserva ≠ salida.
- Semáforos: existencias (normal/baja/mínimo/agotado/repición/sobre-stock) y
  vencimiento (verde/amarillo/rojo/gris/negro) con umbrales por empresa.
- Kardex con saldo corrido y apertura derivada; conciliación
  (`POST /stock/reconcile` + CLI) verificando el invariante AD-5.
- Idempotencia por `idempotency_key` (única por empresa): reintento = mismo
  documento.

## Compras (`modules/purchases`)
- Proveedor activo/bloqueado; OC `OC-01-########` secuencial con bloqueo de
  fila; borrador → aprobada (la aprobación NO mueve stock).
- Recepción parcial/sobre-recepción (rechazada), por línea con lote opcional
  (obligatorio si el producto lo controla) y costo (default el de la OC);
  confirmación ⇒ movimiento `RECEIPT` atómico + avance de líneas + estado
  OC (approved/partial/received).
- Cancelación de OC bloqueada si tiene recepciones (vía reversos).
- Gastos adicionales de adquisición registrados en el documento.
- Cuentas por pagar: módulo financiero Fase 6 (aún no publica cifras).

## Ventas/CRM (`modules/sales`)
- Cliente individual/empresa; límite de crédito y descuento máximo autorizados;
  etiquetas; saldos en `receivables` con antigüedad de saldos (buckets).
- Pedido `PED-…`: precio unitario (mínimo del producto enforced), descuento
  validado contra la política del cliente, cálculo con motor de impuestos.
- Confirmar ⇒ reserva FEFO por lote (no mueve físico); despachos consumen las
  reservas exactas y generan la SALIDA con costo congelado por línea.
- Factura comercial `FAC-…`: snapshot del cliente y desglose (base, tasa,
  cuota, totales) inmutables: cambiar el catálogo después no altera la factura
  (probado); tipos cash/credit con vencimiento; idempotencia; límite de crédito
  enforced al emitir (el cash lo evade explícitamente).
- Cobros parciales `REG-…` contra factura, saldo reconciliado, sobre-pago 422.
- Vendedores con comisión configurable (reportes de rendimiento Fase 6/7).
- Notas de crédito/devoluciones: esquema de documento presente (`is_credit_note`),
  flujo operativo en Fase 6.

## Facturación fiscal (Guatemala FEL)
- **No implementada deliberadamente.** Lo emitido es factura comercial interna.
  La integración legal requiere verificación de normativa vigente y proveedor
  de certificación; el diseño reserva el adaptador desacoplado (`fiscal` +
  numeración por serie/sucursal) para ello. No se declaran facturas como
  fiscales.

## Contabilidad (Fase 6 — pendiente)
- Diseñado sobre partida doble con reglas por documento; mientras no exista,
  `dashboard.accounting=null` y ningún endpoint publica estados financieros.

## Reporting (`modules/reporting`)
- `GET /dashboard?days=N`: valor de inventario (Σ on_hand×costo), stock bajo/
  agotado, lotes por vencer (umbrales de empresa), vencidos en stock, OC por
  recibir, pedidos por despachar, ventas netas del período (base imponible),
  utilidad bruta estimada (ventas − costo de salidas), impuestos del período,
  CxC. Definiciones documentadas en la propia respuesta (`notes`). Distingue
  ventas ≠ cobros ≠ ingresos.

## Auditoría (`core/audit`)
- Append-only; actor, empresa/sucursal, entidad, resultado, ip, valores
  anterior/nuevo sanitizados (nunca contraseñas/tokens/hashes).
