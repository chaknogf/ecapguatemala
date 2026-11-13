import { Hono, MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import type { InStatement } from '@libsql/client';
import { getDb, one, query, run, toMovement, toProduct, ProductRow, MovementRow } from '../lib/db.js';
import { getPayloadFromRequest, hashPassword, signToken, verifyPassword } from '../lib/auth.js';

type Variables = { userId: number; email: string };

const app = new Hono<{ Variables: Variables }>();

app.use('/api/*', cors({ origin: '*' }));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Error interno del servidor' }, 500);
});

app.notFound((c) => c.json({ error: 'Ruta no encontrada' }, 404));

const requireAuth: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const payload = getPayloadFromRequest(c.req.raw);
  if (!payload) {
    return c.json({ error: 'No autorizado' }, 401);
  }
  c.set('userId', payload.sub);
  c.set('email', payload.email);
  return next();
};

app.get('/api/health', (c) => c.json({ ok: true, service: 'synvapp-api' }));

// ---------- Auth ----------

app.post('/api/auth/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'JSON inválido' }, 400);

  const email = String(body.email || '').trim().toLowerCase();
  const username = String(body.username || '').trim() || email.split('@')[0];
  const password = String(body.password || '');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Correo inválido' }, 400);
  }
  if (password.length < 6) {
    return c.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
  }

  const db = await getDb();
  const existing = await one<{ id: number }>(db, 'SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return c.json({ error: 'El correo ya está registrado' }, 409);

  const result = await run(db, 'INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)', [
    email,
    username,
    hashPassword(password),
  ]);

  const user = { id: result.lastInsertRowid, email, username };
  return c.json({ token: signToken(user.id, user.email), user }, 201);
});

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'JSON inválido' }, 400);

  const identifier = String(body.identifier || body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!identifier || !password) {
    return c.json({ error: 'Correo y contraseña son requeridos' }, 400);
  }

  const db = await getDb();
  const user = await one<{
    id: number;
    email: string;
    username: string;
    password_hash: string;
  }>(db, 'SELECT * FROM users WHERE email = ? OR username = ?', [identifier, identifier]);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return c.json({ error: 'Credenciales inválidas' }, 401);
  }

  return c.json({
    token: signToken(user.id, user.email),
    user: { id: user.id, email: user.email, username: user.username },
  });
});

// ---------- Products ----------

app.get('/api/products', async (c) => {
  const db = await getDb();
  const rows = await query<ProductRow>(db, 'SELECT * FROM products ORDER BY name COLLATE NOCASE');
  return c.json({ products: rows.map(toProduct) });
});

app.get('/api/products/:id', async (c) => {
  const db = await getDb();
  const row = await one<ProductRow>(db, 'SELECT * FROM products WHERE id = ?', [c.req.param('id')]);
  if (!row) return c.json({ error: 'Producto no encontrado' }, 404);
  return c.json({ product: toProduct(row) });
});

app.post('/api/products', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'JSON inválido' }, 400);

  const sku = String(body.sku || '').trim();
  const name = String(body.name || '').trim();
  const category = String(body.category || '').trim();
  if (!sku || !name || !category) {
    return c.json({ error: 'sku, name y category son requeridos' }, 400);
  }

  const db = await getDb();
  const existing = await one<{ id: number }>(db, 'SELECT id FROM products WHERE sku = ?', [sku]);
  if (existing) return c.json({ error: 'Ya existe un producto con ese SKU' }, 409);

  const result = await run(
    db,
    'INSERT INTO products (sku, name, category, stock, min_stock, unit) VALUES (?, ?, ?, ?, ?, ?)',
    [
      sku,
      name,
      category,
      Math.max(0, Number(body.stock ?? 0)),
      Math.max(0, Number(body.minStock ?? 0)),
      String(body.unit || 'pza'),
    ]
  );

  const row = await one<ProductRow>(db, 'SELECT * FROM products WHERE id = ?', [
    result.lastInsertRowid,
  ]);
  return c.json({ product: toProduct(row!) }, 201);
});

app.patch('/api/products/:id', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'JSON inválido' }, 400);

  const db = await getDb();
  const current = await one<ProductRow>(db, 'SELECT * FROM products WHERE id = ?', [
    c.req.param('id'),
  ]);
  if (!current) return c.json({ error: 'Producto no encontrado' }, 404);

  await db.execute({
    sql: 'UPDATE products SET name = ?, category = ?, stock = ?, min_stock = ?, unit = ? WHERE id = ?',
    args: [
      body.name !== undefined ? String(body.name) : current.name,
      body.category !== undefined ? String(body.category) : current.category,
      body.stock !== undefined ? Math.max(0, Number(body.stock)) : current.stock,
      body.minStock !== undefined ? Math.max(0, Number(body.minStock)) : current.min_stock,
      body.unit !== undefined ? String(body.unit) : current.unit,
      current.id,
    ],
  });

  const row = await one<ProductRow>(db, 'SELECT * FROM products WHERE id = ?', [current.id]);
  return c.json({ product: toProduct(row!) });
});

// ---------- Movements ----------

type DocumentItemRow = MovementRow & {
  product_name: string;
  product_sku: string;
  product_unit: string;
};

async function toDocument(db: Awaited<ReturnType<typeof getDb>>, documentId: string) {
  const rows = await query<DocumentItemRow>(
    db,
    `SELECT m.*, p.name AS product_name, p.sku AS product_sku, p.unit AS product_unit
     FROM movements m
     JOIN products p ON p.id = m.product_id
     WHERE m.document_id = ?
     ORDER BY m.id ASC`,
    [documentId]
  );
  if (!rows.length) return null;

  const first = rows[0];
  return {
    id: documentId,
    type: first.type,
    counterparty: first.counterparty,
    description: first.description,
    createdAt: first.created_at,
    itemCount: rows.length,
    totalQuantity: rows.reduce((sum, r) => sum + r.quantity, 0),
    items: rows.map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
      productSku: r.product_sku,
      unit: r.product_unit,
      quantity: r.quantity,
      note: r.note,
    })),
  };
}

app.get('/api/movements', async (c) => {
  const db = await getDb();
  const rows = await query<MovementRow & { product_name: string; product_sku: string }>(
    db,
    `SELECT m.*, p.name AS product_name, p.sku AS product_sku
     FROM movements m
     JOIN products p ON p.id = m.product_id
     ORDER BY m.id DESC`
  );

  return c.json({
    movements: rows.map((row) => ({
      ...toMovement(row),
      productName: row.product_name,
      productSku: row.product_sku,
    })),
  });
});

// ---------- Documents (recibo / orden de despacho) ----------

app.post('/api/movements', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'JSON inválido' }, 400);

  const type = body.type === 'entrada' || body.type === 'salida' ? body.type : null;
  const quantity = Math.floor(Number(body.quantity));
  const productId = Number(body.productId);
  const note = body.note ? String(body.note) : null;

  if (!type) return c.json({ error: 'type debe ser "entrada" o "salida"' }, 400);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return c.json({ error: 'quantity debe ser un entero mayor a 0' }, 400);
  }
  if (!Number.isInteger(productId)) return c.json({ error: 'productId inválido' }, 400);

  const db = await getDb();
  const product = await one<ProductRow>(db, 'SELECT * FROM products WHERE id = ?', [productId]);
  if (!product) return c.json({ error: 'Producto no encontrado' }, 404);

  const delta = type === 'entrada' ? quantity : -quantity;
  if (product.stock + delta < 0) {
    return c.json({ error: 'Stock insuficiente para esta salida' }, 409);
  }

  const documentId = crypto.randomUUID();
  const batch = await db.batch([
    {
      sql: 'UPDATE products SET stock = stock + ? WHERE id = ?',
      args: [delta, productId],
    },
    {
      sql: 'INSERT INTO movements (document_id, type, quantity, note, product_id) VALUES (?, ?, ?, ?, ?)',
      args: [documentId, type, quantity, note, productId],
    },
  ]);
  const movementId = Number(batch[1].lastInsertRowid ?? 0);

  const movement = await one<MovementRow>(db, 'SELECT * FROM movements WHERE id = ?', [
    movementId,
  ]);
  const updated = await one<ProductRow>(db, 'SELECT * FROM products WHERE id = ?', [productId]);

  return c.json({ movement: toMovement(movement!), product: toProduct(updated!) }, 201);
});

app.post('/api/documents', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'JSON inválido' }, 400);

  const type = body.type === 'entrada' || body.type === 'salida' ? body.type : null;
  if (!type) return c.json({ error: 'type debe ser "entrada" o "salida"' }, 400);

  const items = Array.isArray(body.items) ? body.items : null;
  if (!items || items.length === 0) {
    return c.json({ error: 'El documento debe incluir al menos un artículo' }, 400);
  }

  const counterparty = body.counterparty ? String(body.counterparty).trim() : null;
  const description = body.description ? String(body.description).trim() : null;

  const db = await getDb();
  type ParsedItem = { productId: number; quantity: number; note: string | null; name: string; sku: string; unit: string };
  const parsed: ParsedItem[] = [];

  for (const item of items) {
    const productId = Number(item?.productId);
    const quantity = Math.floor(Number(item?.quantity));
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1) {
      return c.json({ error: 'Cada artículo requiere productId y quantity (entero > 0)' }, 400);
    }
    const product = await one<ProductRow>(db, 'SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) return c.json({ error: `Producto ${productId} no encontrado` }, 404);
    parsed.push({
      productId,
      quantity,
      note: item.note ? String(item.note) : null,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
    });
  }

  if (type === 'salida') {
    for (const it of parsed) {
      const product = await one<ProductRow>(db, 'SELECT * FROM products WHERE id = ?', [it.productId]);
      if (product && product.stock - it.quantity < 0) {
        return c.json(
          { error: `Stock insuficiente para "${product.name}": disponible ${product.stock}` },
          409
        );
      }
    }
  }

  const documentId = crypto.randomUUID();
  const statements: InStatement[] = [];
  for (const it of parsed) {
    const delta = type === 'entrada' ? it.quantity : -it.quantity;
    statements.push({
      sql: 'UPDATE products SET stock = stock + ? WHERE id = ?',
      args: [delta, it.productId],
    });
    statements.push({
      sql: 'INSERT INTO movements (document_id, type, quantity, note, counterparty, description, product_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [documentId, type, it.quantity, it.note, counterparty, description, it.productId],
    });
  }
  await db.batch(statements);

  const document = await toDocument(db, documentId);
  return c.json({ document }, 201);
});

app.get('/api/documents', async (c) => {
  const db = await getDb();
  const ids = await query<{ document_id: string }>(
    db,
    'SELECT document_id FROM movements WHERE document_id IS NOT NULL GROUP BY document_id ORDER BY MAX(id) DESC'
  );

  const documents = await Promise.all(
    ids.map((d) => toDocument(db, d.document_id))
  ).then((docs) => docs.filter((d): d is NonNullable<typeof d> => d !== null));

  return c.json({ documents });
});

app.get('/api/documents/:id', async (c) => {
  const db = await getDb();
  const document = await toDocument(db, c.req.param('id'));
  if (!document) return c.json({ error: 'Documento no encontrado' }, 404);
  return c.json({ document });
});

app.delete('/api/documents/:id', requireAuth, async (c) => {
  const db = await getDb();
  const documentId = c.req.param('id');
  const document = await toDocument(db, documentId);
  if (!document) return c.json({ error: 'Documento no encontrado' }, 404);

  const statements: InStatement[] = [];
  for (const it of document.items) {
    const delta = document.type === 'entrada' ? -it.quantity : it.quantity;
    statements.push({
      sql: 'UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?',
      args: [delta, it.productId],
    });
  }
  statements.push({ sql: 'DELETE FROM movements WHERE document_id = ?', args: [documentId] });
  await db.batch(statements);

  return c.json({
    deleted: {
      id: documentId,
      type: document.type,
      itemCount: document.itemCount,
      totalQuantity: document.totalQuantity,
    },
  });
});

export default app;