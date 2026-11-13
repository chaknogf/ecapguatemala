from __future__ import annotations

import fnmatch

def pattern_matches(pattern: str, permission: str) -> bool:
    """Coincidencia intencional: exacto, comodín de subniveles («mod.*») o global («*»)."""
    if pattern == permission:
        return True
    if pattern == "*":
        return True
    if pattern.endswith(".*"):
        return permission.startswith(pattern[:-1])
    return fnmatch.fnmatchcase(permission, pattern)


def has_permission(granted: list[str], required: str) -> bool:
    return any(pattern_matches(g, required) for g in granted)


BUILTIN_ROLES: dict[str, list[str]] = {
    "admin_instalacion": ["*"],
    "admin_empresa": [
        "configuracion.*",
        "usuarios.*",
        "catalogo.*",
        "inventario.*",
        "compras.*",
        "ventas.*",
        "clientes.*",
        "proveedores.*",
        "caja.*",
        "contabilidad.*",
        "reportes.*",
        "auditoria.*",
        "fiscal.*",
        "lotes.*",
    ],
    "gerente": [
        "reportes.*",
        "catalogo.*",
        "inventario.*",
        "compras.*",
        "ventas.*",
        "clientes.*",
        "proveedores.*",
        "caja.*",
        "auditoria.registros.leer",
        "configuracion.empresa.leer",
    ],
    "contador": [
        "contabilidad.*",
        "reportes.*",
        "caja.*",
        "fiscal.*",
        "ventas.facturas.leer",
        "compras.facturas.leer",
        "inventario.stock.leer",
        "catalogo.productos.leer",
        "auditoria.registros.leer",
    ],
    "vendedor": [
        "catalogo.productos.leer",
        "inventario.stock.leer",
        "ventas.pedidos.*",
        "ventas.cotizaciones.*",
        "clientes.*",
        "reportes.ventas.leer",
        "reportes.dashboard.leer",
    ],
    "cajero": [
        "caja.*",
        "reportes.dashboard.leer",
        "ventas.facturas.leer",
        "ventas.pagos.*",
        "clientes.leer",
    ],
    "bodeguero": [
        "catalogo.productos.leer",
        "inventario.stock.*",
        "inventario.movimientos.crear",
        "reportes.dashboard.leer",
        "compras.recepciones.registrar",
        "ventas.despachos.preparar",
        "lotes.*",
    ],
    "despachador": [
        "inventario.stock.leer",
        "reportes.dashboard.leer",
        "ventas.despachos.*",
        "ventas.pedidos.leer",
    ],
    "compras": [
        "reportes.dashboard.leer",
        "catalogo.productos.leer",
        "inventario.stock.leer",
        "compras.*",
        "proveedores.*",
        "reportes.compras.leer",
    ],
    "auditor": [
        "auditoria.registros.leer",
        "reportes.*",
        "contabilidad.reportes.leer",
        "contabilidad.libros.leer",
        "inventario.kardex.leer",
        "inventario.stock.leer",
        "catalogo.productos.leer",
    ],
    "consulta": [
        "catalogo.productos.leer",
        "inventario.stock.leer",
        "inventario.kardex.leer",
        "reportes.dashboard.leer",
    ],
}
