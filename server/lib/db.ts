import fs from 'node:fs';
import path from 'node:path';
import { createClient, type Client, type InArgs } from '@libsql/client';
import { hashPassword } from './auth.js';

export interface ProductRow {
  id: number;
  sku: string;
  name: string;
  category: string;
  stock: number;
  min_stock: number;
  unit: string;
  created_at: string;
}

export interface MovementRow {
  id: number;
  document_id: string | null;
  type: 'entrada' | 'salida';
  quantity: number;
  note: string | null;
  counterparty: string | null;
  description: string | null;
  product_id: number;
  created_at: string;
}

export interface UserRow {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  created_at: string;
}

const SEED_PRODUCTS = [
  { sku: 'SKU-001', name: 'Cable HDMI 2m', category: 'Cables', stock: 48, min_stock: 10, unit: 'pza' },
  { sku: 'SKU-002', name: 'Mouse inalámbrico', category: 'Periféricos', stock: 6, min_stock: 10, unit: 'pza' },
  { sku: 'SKU-003', name: 'Teclado mecánico', category: 'Periféricos', stock: 22, min_stock: 5, unit: 'pza' },
  { sku: 'SKU-004', name: 'Monitor 24"', category: 'Pantallas', stock: 3, min_stock: 4, unit: 'pza' },
  { sku: 'SKU-005', name: 'USB 128GB', category: 'Almacenamiento', stock: 75, min_stock: 20, unit: 'pza' },
  { sku: 'SKU-006', name: 'Laptop 15"', category: 'Equipos', stock: 12, min_stock: 3, unit: 'pza' },
  { sku: 'SKU-007', name: 'Cable de red Cat6', category: 'Cables', stock: 90, min_stock: 30, unit: 'm' },
  { sku: 'SKU-008', name: 'Webcam FullHD', category: 'Periféricos', stock: 4, min_stock: 5, unit: 'pza' },
];

const SEED_USERS = [
  { email: 'demo@synvapp.com', username: 'demo', password: 'secret123' },
  { email: 'admin@synvapp.com', username: 'admin', password: 'Admin1234!' },
];

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'pza',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT,
    type TEXT NOT NULL CHECK (type IN ('entrada', 'salida')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    note TEXT,
    counterparty TEXT,
    description TEXT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_movements_product ON movements(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_movements_document ON movements(document_id)`,
];

async function ensureColumn(
  db: Client,
  table: string,
  column: string,
  ddl: string
): Promise<void> {
  const rs = await db.execute(`PRAGMA table_info(${table})`);
  const cols = rs.rows as unknown as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

async function createDb(): Promise<Client> {
  const tursoUrl = process.env['TURSO_DATABASE_URL'];

  let db: Client;
  if (tursoUrl) {
    db = createClient({ url: tursoUrl, authToken: process.env['TURSO_AUTH_TOKEN'] });
  } else {
    const filePath =
      process.env['DATABASE_PATH'] || path.join(process.cwd(), 'data', 'app.db');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    db = createClient({ url: `file:${filePath}` });
  }

  await db.execute('PRAGMA defer_foreign_keys = ON');
  await db.batch(SCHEMA_STATEMENTS.map((sql) => ({ sql })));

  await ensureColumn(db, 'movements', 'document_id', 'document_id TEXT');
  await ensureColumn(db, 'movements', 'counterparty', 'counterparty TEXT');
  await ensureColumn(db, 'movements', 'description', 'description TEXT');

  const productCount = (await db.execute('SELECT COUNT(*) AS n FROM products')).rows[0] as unknown as {
    n: number;
  };
  if (Number(productCount.n) === 0) {
    for (const row of SEED_PRODUCTS) {
      await db.execute({
        sql: 'INSERT INTO products (sku, name, category, stock, min_stock, unit) VALUES (?, ?, ?, ?, ?, ?)',
        args: [row.sku, row.name, row.category, row.stock, row.min_stock, row.unit],
      });
    }
  }

  const userCount = (await db.execute('SELECT COUNT(*) AS n FROM users')).rows[0] as unknown as {
    n: number;
  };
  if (Number(userCount.n) === 0) {
    for (const row of SEED_USERS) {
      await db.execute({
        sql: 'INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)',
        args: [row.email, row.username, hashPassword(row.password)],
      });
    }
  }

  return db;
}

type GlobalWithDb = typeof globalThis & { __synvappDb?: Promise<Client> };
const g = globalThis as GlobalWithDb;

export function getDb(): Promise<Client> {
  if (!g.__synvappDb) {
    g.__synvappDb = createDb();
  }
  return g.__synvappDb;
}

export async function query<T = Record<string, unknown>>(
  db: Client,
  sql: string,
  args: InArgs = []
): Promise<T[]> {
  const rs = await db.execute({ sql, args });
  return rs.rows as unknown as T[];
}

export async function one<T = Record<string, unknown>>(
  db: Client,
  sql: string,
  args: InArgs = []
): Promise<T | undefined> {
  const rows = await query<T>(db, sql, args);
  return rows[0];
}

export async function run(
  db: Client,
  sql: string,
  args: InArgs = []
): Promise<{ lastInsertRowid: number; rowsAffected: number }> {
  const rs = await db.execute({ sql, args });
  return { lastInsertRowid: Number(rs.lastInsertRowid ?? 0), rowsAffected: rs.rowsAffected };
}

export function toProduct(row: ProductRow) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    stock: row.stock,
    minStock: row.min_stock,
    unit: row.unit,
    createdAt: row.created_at,
  };
}

export function toMovement(row: MovementRow) {
  return {
    id: row.id,
    documentId: row.document_id,
    type: row.type,
    quantity: row.quantity,
    note: row.note,
    counterparty: row.counterparty,
    description: row.description,
    productId: row.product_id,
    createdAt: row.created_at,
  };
}