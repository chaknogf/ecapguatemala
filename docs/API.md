# API `/api/v1` — referencia rápida

64 endpoints. En modo `development` están vivos en `GET /api/v1/docs` (Swagger)
y `/api/v1/openapi.json`; en `production` se deshabilitan.

## Autenticación

```
POST /api/v1/auth/login          {email, password, company_id?}
                                 → tokens | requires_company_selection (multi-empresa)
POST /api/v1/auth/select-company {refresh_token, company_id}   # elige empresa activa
POST /api/v1/auth/refresh        {refresh_token}               # rotación (un solo uso)
POST /api/v1/auth/logout         {refresh_token}
POST /api/v1/auth/change-password{current_password, new_password}
GET  /api/v1/auth/me
```

Autenticación subsiguiente: `Authorization: Bearer <access_token>`. El `cid`
del token fija la empresa de todas las consultas (no existe parámetro de empresa
en el cliente).

## Ejemplo mínimo (curl)

```bash
API=http://127.0.0.1:1337/api/v1
curl -s $API/health
TOKEN=$(curl -s $API/auth/login -H 'content-type: application/json' \
  -d '{"email":"root@local","password":"LaQueElegiste1","company_id":"<uuid>"}' \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["tokens"]["access_token"])')
AUTH="Authorization: Bearer $TOKEN"

curl -s $API/companies/current -H "$AUTH"
curl -s $API/branches -H "$AUTH"
curl -s -X POST $API/catalog/units -H "$AUTH" -H 'content-type: application/json' \
  -d '{"code":"PZA","name":"Pieza"}'
curl -s -X POST $API/catalog/products -H "$AUTH" -H 'content-type: application/json' \
  -d '{"sku":"A1","name":"Tornillo","stock_unit_id":"<uuid>","min_stock":"10","sale_price":"5","track_lots":false}'
curl -s -X POST $API/movements -H "$AUTH" -H 'content-type: application/json' \
  -d '{"movement_type":"receipt","warehouse_id":"<uuid>","reference_document":"OC-1",
       "idempotency_key":"abc123","lines":[{"product_id":"<uuid>","quantity":"100","unit_cost":"2"}]}'
curl -s "$API/stock" -H "$AUTH"
curl -s "$API/stock/kardex?product_id=<uuid>" -H "$AUTH"
curl -s "$API/dashboard?days=30" -H "$AUTH"
```

## Superficie

| Grupo | Rutas principales |
|---|---|
| tenancy | `POST/PATCH /companies[/current]`, `GET/POST /branches`, `GET/POST/PATCH /warehouses` |
| identidad | `GET/POST/PATCH /users`, `POST/PATCH /users/{id}/branch`, `GET/POST/PATCH /roles`, `GET /permissions/catalog` |
| catálogo | `GET/POST/PATCH /catalog/{units,categories,brands,taxes,attributes,variant-attrs}`; `GET/POST/PATCH /catalog/products`; `GET /catalog/lookup?term=` (SKU/código interno/variante/barcode); `POST /catalog/pricing/analyze` |
| inventario | `GET /stock`, `GET /stock/lots/expiring`, `GET /stock/kardex`, `POST /stock/reconcile`, `GET/POST /lots`, `PATCH /lots/{id}`, `POST /movements` (receipt/sale/return_*/adjustment/count/damage/production_*; `auto_pick=fefo`; `idempotency_key`), `POST /movements/transfer`, `POST /movements/reverse`, `GET /movements` |
| compras | `GET/POST/PATCH /suppliers`, `GET/POST /purchase-orders`, `POST /purchase-orders/{id}/approve|cancel|receipts`, `GET /purchase-orders/{id}/pending`, `GET /goods-receipts` |
| ventas | `GET/POST/PATCH /customers`, `GET/POST /salespeople`, `GET/POST /sales-orders`, `POST /sales-orders/{id}/confirm|dispatch|cancel`, `GET/POST /invoices`, `POST /payments`, `GET /payment-methods`, `GET /receivables` |
| reporting | `GET /dashboard?days=N` |
| auditoría | `GET /audit/events` (filtros entity/action/fechas; paginado) |

Códigos de error: `{error, message, details}` — 401 (authn), 403 (permiso),
404 (no existe o no es de tu empresa), 409 (conflicto/stock/unico),
422 (regla de negocio/validación).

Pruebas de referencia para cada flujo: `backend/tests/` (pytest ejecuta contra
PostgreSQL sobre el esquema migrado).
