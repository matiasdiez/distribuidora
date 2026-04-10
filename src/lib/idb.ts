import { openDB, type IDBPDatabase } from 'idb';
import type { Product, StockEntry, Depot } from './supabase';

// ── Schema de IndexedDB ───────────────────────────────────────

const DB_NAME    = 'deposito-db';
const DB_VERSION = 2;   // ← bump: agrega índice depot_id en products

export type PendingSync =
  | {
      id?: number;
      type: 'stock_upsert';
      payload: Omit<StockEntry, 'id' | 'created_at'>;
      created_at: string;
    }
  | {
      id?: number;
      type: 'depot_assignment';
      payload: { product_ids: number[]; depot_id: number | null };
      created_at: string;
    };

interface DepostioDB {
  products: {
    key:     number;
    value:   Product;
    indexes: {
      by_brand:    string;
      by_category: string;
      by_code:     string;
    };
  };
  stock_entries: {
    key:     number;
    value:   StockEntry & { local_id?: number };
    indexes: {
      by_product: number;
      by_depot:   number;
    };
  };
  depots: {
    key:   number;
    value: Depot;
  };
  pending_sync: {
    key:   number;
    value: PendingSync;
  };
  meta: {
    key:   string;
    value: { key: string; value: string };
  };
}

// ── Apertura y migración ──────────────────────────────────────

let _db: IDBPDatabase<DepostioDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<DepostioDB>> {
  if (_db) return _db;

  _db = await openDB<DepostioDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        // Productos
        const productStore = db.createObjectStore('products', { keyPath: 'id' });
        productStore.createIndex('by_brand',    'brand');
        productStore.createIndex('by_category', 'category');
        productStore.createIndex('by_code',     'code', { unique: true });

        // Stock
        const stockStore = db.createObjectStore('stock_entries', {
          keyPath: 'id',
          autoIncrement: true,
        });
        stockStore.createIndex('by_product', 'product_id');
        stockStore.createIndex('by_depot',   'depot_id');

        // Depósitos
        db.createObjectStore('depots', { keyPath: 'id' });

        // Cola de sync pendiente
        db.createObjectStore('pending_sync', {
          keyPath: 'id',
          autoIncrement: true,
        });

        // Metadatos (ej: fecha última sync)
        db.createObjectStore('meta', { keyPath: 'key' });
      }

      if (oldVersion < 2) {
        // Migración v2: índice por depot_id en productos
        const productStore = db.transaction.objectStore('products');
        if (!productStore.indexNames.contains('by_depot')) {
          productStore.createIndex('by_depot', 'depot_id');
        }
      }
    },
  });

  return _db;
}


// ── Productos ─────────────────────────────────────────────────

/** Guarda lista completa de productos (sync inicial) */
export async function saveProducts(products: Product[]): Promise<void> {
  const db  = await getDB();
  const tx  = db.transaction('products', 'readwrite');
  await Promise.all([
    ...products.map(p => tx.store.put(p)),
    tx.done,
  ]);
}

/** Búsqueda local de productos por texto libre */
export async function searchProducts(
  query: string,
  category?: string,
  depotId?: number | 'unassigned' | 'all'
): Promise<Product[]> {
  const db       = await getDB();
  const lowerQ   = query.toLowerCase().trim();
  let   products: Product[];

  // Filtrar por depósito si se indica
  if (depotId === 'unassigned') {
    const all = await db.getAll('products');
    products = all.filter(p => p.depot_id == null);
  } else if (typeof depotId === 'number') {
    products = await db.getAllFromIndex('products', 'by_depot', depotId);
  } else if (category && category !== 'Todos') {
    products = await db.getAllFromIndex('products', 'by_category', category);
  } else {
    products = await db.getAll('products');
  }

  // Filtro de categoría secundario cuando se filtra por depósito
  if (typeof depotId !== 'undefined' && category && category !== 'Todos') {
    products = products.filter(p => p.category === category);
  }

  if (!lowerQ) return products;

  return products.filter(p =>
    p.brand.toLowerCase().includes(lowerQ) ||
    p.description.toLowerCase().includes(lowerQ) ||
    p.code.toLowerCase().includes(lowerQ) ||
    (p.weight_qty ?? '').toLowerCase().includes(lowerQ)
  );
}

/** Asigna un depósito a productos localmente y encola para sync */
export async function assignProductsToDepotLocal(
  productIds: number[],
  depotId: number | null
): Promise<void> {
  const db  = await getDB();
  const now = new Date().toISOString();
  const tx  = db.transaction(['products', 'pending_sync'], 'readwrite');

  await Promise.all(
    productIds.map(async id => {
      const product = await tx.objectStore('products').get(id);
      if (product) {
        tx.objectStore('products').put({ ...product, depot_id: depotId });
      }
    })
  );

  // Encolar sync
  tx.objectStore('pending_sync').add({
    type:       'depot_assignment',
    payload:    { product_ids: productIds, depot_id: depotId },
    created_at: now,
  });

  await tx.done;
}

/** Trae todas las categorías únicas */
export async function getCategories(): Promise<string[]> {
  const db       = await getDB();
  const products = await db.getAll('products');
  const cats     = [...new Set(products.map(p => p.category))].sort();
  return cats;
}

/** Cuenta total de productos guardados */
export async function countProducts(): Promise<number> {
  const db = await getDB();
  return db.count('products');
}


// ── Stock ─────────────────────────────────────────────────────

/** Guarda entradas de stock remotas (sync inicial) */
export async function saveStockEntries(entries: StockEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('stock_entries', 'readwrite');
  await Promise.all([
    ...entries.map(e => tx.store.put(e)),
    tx.done,
  ]);
}

/** Trae todo el stock de un producto */
export async function getStockByProduct(productId: number): Promise<StockEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('stock_entries', 'by_product', productId);
}

/** Stock total de un producto en un depósito */
export async function getTotalStock(productId: number, depotId: number): Promise<number> {
  const entries = await getStockByProduct(productId);
  return entries
    .filter(e => e.depot_id === depotId)
    .reduce((sum, e) => sum + e.quantity, 0);
}

/** Agrega o actualiza un lote localmente y encola para sync */
export async function addStockEntry(
  entry: Omit<StockEntry, 'id' | 'created_at'>,
  depotId: number
): Promise<void> {
  const db      = await getDB();
  const all     = await db.getAllFromIndex('stock_entries', 'by_product', entry.product_id);
  const existing = all.find(
    e => e.depot_id === depotId && e.lot_number === entry.lot_number
  );

  const now = new Date().toISOString();
  const tx  = db.transaction(['stock_entries', 'pending_sync'], 'readwrite');

  if (existing) {
    // Suma al lote existente
    const updated = { ...existing, quantity: existing.quantity + entry.quantity };
    tx.objectStore('stock_entries').put(updated);
  } else {
    // Lote nuevo
    tx.objectStore('stock_entries').add({
      ...entry,
      depot_id:   depotId,
      created_at: now,
    });
  }

  // Encola para sync remoto
  tx.objectStore('pending_sync').add({
    type:       'stock_upsert',
    payload:    { ...entry, depot_id: depotId },
    created_at: now,
  });

  await tx.done;
}


// ── Depósitos ─────────────────────────────────────────────────

export async function saveDepots(depots: Depot[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('depots', 'readwrite');
  await Promise.all([
    ...depots.map(d => tx.store.put(d)),
    tx.done,
  ]);
}

export async function getDepots(): Promise<Depot[]> {
  const db = await getDB();
  return db.getAll('depots');
}


// ── Sync pendiente ────────────────────────────────────────────

export async function getPendingSync(): Promise<PendingSync[]> {
  const db = await getDB();
  return db.getAll('pending_sync');
}

export async function clearPendingSync(ids: number[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('pending_sync', 'readwrite');
  await Promise.all([
    ...ids.map(id => tx.store.delete(id)),
    tx.done,
  ]);
}


// ── Metadatos ─────────────────────────────────────────────────

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put('meta', { key, value });
}

export async function getMeta(key: string): Promise<string | null> {
  const db  = await getDB();
  const row = await db.get('meta', key);
  return row?.value ?? null;
}

/** Verifica si ya se hizo la sync inicial */
export async function isInitialized(): Promise<boolean> {
  const val = await getMeta('initialized');
  return val === 'true';
}
