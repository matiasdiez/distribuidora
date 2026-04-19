import { openDB, type IDBPDatabase } from "idb";
import type { Product, StockEntry, Depot } from "./supabase";

// ── Schema de IndexedDB ───────────────────────────────────────

const DB_NAME = "deposito-db";
const DB_VERSION = 9; // v9: categories local + dead_letters queue

export type PendingSync =
  | {
      id?: number;
      type: "stock_upsert";
      payload: Omit<StockEntry, "id" | "created_at">;
      created_at: string;
    }
  | {
      /**
       * Historial de un lote MODIFICADO (no aplica a lotes nuevos).
       * Se encola SIEMPRE después de su stock_upsert correspondiente.
       * Se sincroniza vía RPC upsert_stock_with_history para atomicidad,
       * pero si por alguna razón se procesa solo, inserta solo el historial.
       */
      id?: number;
      type: "stock_history_insert";
      payload: {
        product_id:   number;
        depot_id:     number;
        lot_number:   string;
        old_quantity: number;
        old_boxes:    number;
        new_quantity: number;
        new_boxes:    number;
        move_type:    MoveType;
        changed_at:   string;
      };
      created_at: string;
    }
  | {
      id?: number;
      type: "depot_assignment";
      payload: { product_ids: number[]; depot_id: number | null };
      created_at: string;
    }
  | {
      id?: number;
      type: "depot_create";
      payload: { name: string; temp_id: number };
      created_at: string;
    }
  | {
      id?: number;
      type: "brand_note_upsert";
      payload: Omit<BrandNote, 'id'>;
      created_at: string;
    }
  | {
      id?: number;
      type: "brand_note_delete";
      payload: { remote_id: number };
      created_at: string;
    }
  | {
      id?: number;
      type: "sub_depot_create";
      payload: { depot_id: number; name: string; temp_id: number };
      created_at: string;
    }
  | {
      id?: number;
      type: "product_sub_depot_assign";
      payload: { product_ids: number[]; sub_depot_id: number | null };
      created_at: string;
    };

export type MoveType = 'recepcion' | 'inventario';

export interface DeadLetter {
  id?:          number;
  item:         PendingSync;   // el item original que falló
  fail_count:   number;        // cuántas veces falló
  last_error:   string;        // último mensaje de error
  first_failed: string;        // ISO timestamp del primer fallo
  last_failed:  string;        // ISO timestamp del último fallo
}
export type NoteStatus   = 'open' | 'done';
export type NotePriority = 'low'  | 'normal' | 'high';

export interface SubDepot {
  id:       number;
  depot_id: number;
  name:     string;
}

export interface BrandNote {
  id?:        number;  // autoincrement local
  remote_id?: number;  // id en Supabase (null hasta sincronizar)
  brand:      string;
  content:    string;
  status:     NoteStatus;
  priority:   NotePriority;
  due_date:   string | null;  // ISO date YYYY-MM-DD
  created_at: string;
  updated_at: string;
  _deleted?:  boolean;  // marcada para borrar en pending_sync
}

export interface StockHistoryEntry {
  id?: number;
  product_id: number;
  depot_id: number;
  lot_number: string;
  old_quantity: number;
  old_boxes: number;
  new_quantity: number;
  new_boxes: number;
  move_type: MoveType;   // 'recepcion' = suma delta | 'inventario' = reemplaza con conteo
  changed_at: string;
}

interface DepostioDB {
  products: {
    key: number;
    value: Product;
    indexes: { by_brand: string; by_category: string; by_code: string };
  };
  stock_entries: {
    key: number;
    value: StockEntry & { local_id?: number };
    indexes: { by_product: number; by_depot: number };
  };
  stock_history: {
    key: number;
    value: StockHistoryEntry;
    indexes: { by_product: number };
  };
  depots: { key: number; value: Depot };
  sub_depots: { key: number; value: SubDepot; indexes: { by_depot: number } };
  brand_notes: {
    key: number;
    value: BrandNote;
    indexes: { by_brand: string; by_status: string };
  };
  categories: { key: string; value: { name: string } };
  dead_letters: { key: number; value: DeadLetter };
  pending_sync: { key: number; value: PendingSync };
  meta: { key: string; value: { key: string; value: string } };
}

let _db: IDBPDatabase<DepostioDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<DepostioDB>> {
  if (_db) return _db;
  _db = await openDB<DepostioDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const productStore = db.createObjectStore("products", { keyPath: "id" });
        productStore.createIndex("by_brand", "brand");
        productStore.createIndex("by_category", "category");
        productStore.createIndex("by_code", "code", { unique: true });
        const stockStore = db.createObjectStore("stock_entries", { keyPath: "id", autoIncrement: true });
        stockStore.createIndex("by_product", "product_id");
        stockStore.createIndex("by_depot", "depot_id");
        db.createObjectStore("depots", { keyPath: "id" });
        db.createObjectStore("pending_sync", { keyPath: "id", autoIncrement: true });
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (oldVersion < 2) {
        const ps = transaction.objectStore("products");
        if (!ps.indexNames.contains("by_depot")) ps.createIndex("by_depot", "depot_id");
      }
      if (oldVersion < 3) { try { transaction.objectStore("meta").delete("last_sync"); } catch {} }
      if (oldVersion < 4) { try { transaction.objectStore("meta").delete("last_sync"); } catch {} }
      if (oldVersion < 5) {
        try { transaction.objectStore("meta").delete("last_sync"); transaction.objectStore("meta").delete("initialized"); } catch {}
      }
      if (oldVersion < 6) {
        if (!db.objectStoreNames.contains("stock_history")) {
          const hs = db.createObjectStore("stock_history", { keyPath: "id", autoIncrement: true });
          hs.createIndex("by_product", "product_id");
        }
      }
      if (oldVersion < 7) {
        // v7: sub-depósitos y notas/tareas de marca
        if (!db.objectStoreNames.contains("sub_depots")) {
          const sd = db.createObjectStore("sub_depots", { keyPath: "id", autoIncrement: true });
          sd.createIndex("by_depot", "depot_id");
        }
        if (!db.objectStoreNames.contains("brand_notes")) {
          const bn = db.createObjectStore("brand_notes", { keyPath: "id", autoIncrement: true });
          bn.createIndex("by_brand",  "brand");
          bn.createIndex("by_status", "status");
        }
      }
      if (oldVersion < 8) {
        if (db.objectStoreNames.contains("brand_notes")) {
          transaction.objectStore("brand_notes").clear();
        }
      }
      if (oldVersion < 9) {
        // v9: caché local de categorías + cola de mensajes fallidos
        if (!db.objectStoreNames.contains("categories")) {
          db.createObjectStore("categories", { keyPath: "name" });
        }
        if (!db.objectStoreNames.contains("dead_letters")) {
          db.createObjectStore("dead_letters", { keyPath: "id", autoIncrement: true });
        }
      }
    },
  });
  return _db;
}

// ── Productos ─────────────────────────────────────────────────

export async function saveProducts(products: Product[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("products", "readwrite");
  await Promise.all([...products.map((p) => tx.store.put(p)), tx.done]);
}

export async function searchProducts(
  query: string,
  category?: string,
  depotId?: number | "unassigned" | "all",
  subDepotId?: number | null,
): Promise<Product[]> {
  const db = await getDB();
  const lowerQ = query.toLowerCase().trim();
  let products: Product[];

  if (depotId === "unassigned") {
    const all = await db.getAll("products");
    products = all.filter((p) => p.depot_id == null);
  } else if (typeof depotId === "number") {
    products = await db.getAllFromIndex("products", "by_depot", depotId);
  } else if (category && category !== "Todos") {
    products = await db.getAllFromIndex("products", "by_category", category);
  } else {
    products = await db.getAll("products");
  }

  if (typeof depotId !== "undefined" && category && category !== "Todos") {
    products = products.filter((p) => p.category === category);
  }

  // Filtro de sub-depósito (null = sin asignar, number = sub-depósito específico)
  if (subDepotId !== undefined) {
    products = products.filter((p) =>
      subDepotId === null
        ? (p as any).sub_depot_id == null
        : (p as any).sub_depot_id === subDepotId
    );
  }

  if (!lowerQ) return products;

  // Separar en tokens y filtrar productos que contengan TODOS los tokens (AND)
  const tokens = lowerQ.split(/\s+/).filter(Boolean);

  return products.filter((p) => {
    const haystack = [
      p.brand,
      p.description,
      p.code,
      p.weight_qty ?? "",
      p.category,
    ].join(" ").toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}

export async function assignProductsToDepotLocal(
  productIds: number[],
  depotId: number | null,
): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();
  const tx = db.transaction(["products", "pending_sync"], "readwrite");
  await Promise.all(
    productIds.map(async (id) => {
      const product = await tx.objectStore("products").get(id);
      if (product) tx.objectStore("products").put({ ...product, depot_id: depotId });
    }),
  );
  tx.objectStore("pending_sync").add({
    type: "depot_assignment",
    payload: { product_ids: productIds, depot_id: depotId },
    created_at: now,
  });
  await tx.done;
}

export async function getBrands(): Promise<string[]> {
  const db = await getDB();
  const products = await db.getAll("products");
  return [...new Set(products.map((p) => p.brand))].sort();
}

export async function getCategories(): Promise<string[]> {
  const db = await getDB();
  const products = await db.getAll("products");
  return [...new Set(products.map((p) => p.category))].sort();
}

export async function countProducts(): Promise<number> {
  const db = await getDB();
  return db.count("products");
}

// ── Stock ─────────────────────────────────────────────────────

export async function saveStockEntries(entries: StockEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("stock_entries", "readwrite");
  await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done]);
}

export async function getStockByProduct(productId: number): Promise<StockEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex("stock_entries", "by_product", productId);
}

export async function getTotalStock(productId: number, depotId: number): Promise<number> {
  const entries = await getStockByProduct(productId);
  return entries
    .filter((e) => e.depot_id === depotId && e.lot_number !== "CONTROL")
    .reduce((sum, e) => sum + e.quantity, 0);
}

/**
 * Agrega o actualiza un lote según el modo indicado.
 *
 * mode = 'add'  → RECEPCIÓN: suma el delta al stock existente.
 *                 El operario ingresa cuánto llegó ("recibí 5 cajas").
 *                 El payload enviado a Supabase siempre es el TOTAL resultante.
 *
 * mode = 'set'  → INVENTARIO: reemplaza con el conteo real.
 *                 El operario ingresa lo que ve en el estante ("hay 12 unidades").
 *                 Supabase queda con ese valor absoluto.
 *
 * Para lotes nuevos ambos modos son equivalentes (no hay valor previo).
 * El payload de sync siempre lleva el total final, nunca el delta,
 * para que Supabase quede consistente con IndexedDB.
 */
export async function addStockEntry(
  entry: Omit<StockEntry, "id" | "created_at">,
  depotId: number,
  mode: 'add' | 'set' = 'set',
): Promise<void> {
  const db = await getDB();
  const all = await db.getAllFromIndex("stock_entries", "by_product", entry.product_id);
  const existing = all.find(
    (e) => e.depot_id === depotId && e.lot_number === entry.lot_number,
  );

  const now = new Date().toISOString();

  // Calcular valores finales según modo
  const finalQty  = (mode === 'add' && existing)
    ? (existing.quantity      + entry.quantity)
    : entry.quantity;
  const finalBoxes = (mode === 'add' && existing)
    ? ((existing.boxes ?? 0)  + (entry.boxes ?? 0))
    : (entry.boxes ?? 0);

  const tx = db.transaction(["stock_entries", "stock_history", "pending_sync"], "readwrite");

  if (existing) {
    // Guardar historial con tipo de movimiento
    tx.objectStore("stock_history").add({
      product_id: existing.product_id,
      depot_id:   existing.depot_id,
      lot_number: existing.lot_number,
      old_quantity: existing.quantity,
      old_boxes:    existing.boxes ?? 0,
      new_quantity: finalQty,
      new_boxes:    finalBoxes,
      move_type:    mode === 'add' ? 'recepcion' : 'inventario',
      changed_at:   now,
    } as StockHistoryEntry);

    tx.objectStore("stock_entries").put({
      ...existing,
      quantity:    finalQty,
      boxes:       finalBoxes,
      expiry_date: entry.expiry_date !== undefined ? entry.expiry_date : existing.expiry_date,
      notes:       entry.notes       !== undefined ? entry.notes       : existing.notes,
      created_at:  now,
    });
  } else {
    // Lote nuevo: 'add' y 'set' son equivalentes
    tx.objectStore("stock_entries").add({
      ...entry,
      quantity:    finalQty,
      boxes:       finalBoxes,
      expiry_date: entry.expiry_date ?? null,
      depot_id:    depotId,
      created_at:  now,
    });
  }

  // Payload de sync siempre lleva el total final (no el delta).
  // Para lotes existentes usamos la RPC atómica que combina stock_upsert
  // e historial en una sola transacción de base de datos.
  // Para lotes nuevos usamos solo stock_upsert (no hay historial previo).
  if (existing) {
    // Lote existente: encolamos un item unificado que la RPC maneja
    // en una transacción atómica en Supabase.
    tx.objectStore("pending_sync").add({
      type: "stock_upsert",
      payload: {
        ...entry,
        quantity:    finalQty,
        boxes:       finalBoxes,
        expiry_date: entry.expiry_date ?? null,
        depot_id:    depotId,
        // Campos extra para la RPC (ignorados por upsertStockEntry fallback)
        _history: {
          old_quantity: existing.quantity,
          old_boxes:    existing.boxes ?? 0,
          move_type:    mode === 'add' ? 'recepcion' : 'inventario',
          changed_at:   now,
        },
      },
      created_at: now,
    });
  } else {
    // Lote nuevo: sin historial previo
    tx.objectStore("pending_sync").add({
      type: "stock_upsert",
      payload: {
        ...entry,
        quantity:    finalQty,
        boxes:       finalBoxes,
        expiry_date: entry.expiry_date ?? null,
        depot_id:    depotId,
      },
      created_at: now,
    });
  }

  await tx.done;
}

/**
 * Confirma "sin stock" para un producto en un depósito.
 * Crea/actualiza una entrada especial lot_number="CONTROL" con quantity=0.
 * La fecha de esta entrada aparece como "Última actualización" en el CSV,
 * indicando que el producto fue chequeado aunque esté en cero.
 */
export async function confirmNoStock(productId: number, depotId: number): Promise<void> {
  const db = await getDB();
  const all = await db.getAllFromIndex("stock_entries", "by_product", productId);
  const controlLot = all.find((e) => e.depot_id === depotId && e.lot_number === "CONTROL");

  const now = new Date().toISOString();
  const tx = db.transaction(["stock_entries", "pending_sync"], "readwrite");

  if (controlLot) {
    tx.objectStore("stock_entries").put({ ...controlLot, created_at: now });
  } else {
    tx.objectStore("stock_entries").add({
      product_id: productId,
      depot_id: depotId,
      lot_number: "CONTROL",
      quantity: 0,
      boxes: 0,
      expiry_date: null,
      notes: "Sin stock confirmado",
      created_at: now,
    });
  }

  tx.objectStore("pending_sync").add({
    type: "stock_upsert",
    payload: {
      product_id: productId,
      depot_id: depotId,
      lot_number: "CONTROL",
      quantity: 0,
      boxes: 0,
      expiry_date: null,
      notes: "Sin stock confirmado",
    },
    created_at: now,
  });

  await tx.done;
}

/** Historial de cambios de un producto */
export async function getStockHistory(productId: number): Promise<StockHistoryEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex("stock_history", "by_product", productId);
}

export async function getExpiringLots(
  days: number = 30,
): Promise<(StockEntry & { local_id?: number })[]> {
  const db = await getDB();
  const all = await db.getAll("stock_entries");
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return all.filter((e) => {
    if (!e.expiry_date || e.lot_number === "CONTROL") return false;
    const exp = new Date(e.expiry_date);
    return exp >= today && exp <= limit && (e.quantity > 0 || (e.boxes ?? 0) > 0);
  });
}

// ── Depósitos ─────────────────────────────────────────────────

export async function saveDepots(depots: Depot[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("depots", "readwrite");
  await Promise.all([...depots.map((d) => tx.store.put(d)), tx.done]);
}

export async function getDepots(): Promise<Depot[]> {
  const db = await getDB();
  return db.getAll("depots");
}

// ── Sync pendiente ────────────────────────────────────────────

export async function getPendingSync(): Promise<PendingSync[]> {
  const db = await getDB();
  return db.getAll("pending_sync");
}

export async function clearPendingSync(ids: number[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("pending_sync", "readwrite");
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

// ── Metadatos ─────────────────────────────────────────────────

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put("meta", { key, value });
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDB();
  const row = await db.get("meta", key);
  return row?.value ?? null;
}

// ── Sub-depósitos ─────────────────────────────────────────────

export async function saveSubDepots(items: SubDepot[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("sub_depots", "readwrite");
  await Promise.all([...items.map((s) => tx.store.put(s)), tx.done]);
}

export async function getSubDepots(depotId?: number): Promise<SubDepot[]> {
  const db = await getDB();
  if (typeof depotId === "number") {
    return db.getAllFromIndex("sub_depots", "by_depot", depotId);
  }
  return db.getAll("sub_depots");
}

export async function assignProductsToSubDepotLocal(
  productIds: number[],
  subDepotId: number | null,
): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();
  const tx = db.transaction(["products", "pending_sync"], "readwrite");
  await Promise.all(
    productIds.map(async (id) => {
      const p = await tx.objectStore("products").get(id);
      if (p) tx.objectStore("products").put({ ...p, sub_depot_id: subDepotId });
    }),
  );
  tx.objectStore("pending_sync").add({
    type: "product_sub_depot_assign",
    payload: { product_ids: productIds, sub_depot_id: subDepotId },
    created_at: now,
  });
  await tx.done;
}

// ── Notas / Tareas de marca ───────────────────────────────────

export async function saveBrandNote(
  note: Omit<BrandNote, 'id' | 'created_at' | 'updated_at'>,
): Promise<BrandNote> {
  const db = await getDB();
  const now = new Date().toISOString();
  const full: BrandNote = {
    ...note,
    created_at: now,
    updated_at: now,
  };
  const id = await db.add("brand_notes", full);
  const saved = { ...full, id: id as number };

  // Encolar sync
  const pending = await getDB();
  await pending.add("pending_sync", {
    type: "brand_note_upsert",
    payload: { ...saved },
    created_at: now,
  } as any);

  return saved;
}

export async function updateBrandNote(
  id: number,
  patch: Partial<Omit<BrandNote, 'id' | 'created_at'>>,
): Promise<void> {
  const db = await getDB();
  const existing = await db.get("brand_notes", id);
  if (!existing) return;
  const now = new Date().toISOString();
  const updated = { ...existing, ...patch, updated_at: now };
  await db.put("brand_notes", updated);

  await db.add("pending_sync", {
    type: "brand_note_upsert",
    payload: { ...updated },
    created_at: now,
  } as any);
}

export async function deleteBrandNote(id: number): Promise<void> {
  const db = await getDB();
  const note = await db.get("brand_notes", id);
  const now = new Date().toISOString();
  await db.delete("brand_notes", id);
  if (note?.remote_id) {
    await db.add("pending_sync", {
      type: "brand_note_delete",
      payload: { remote_id: note.remote_id },
      created_at: now,
    } as any);
  }
}

export async function getBrandNotes(brand?: string): Promise<BrandNote[]> {
  const db = await getDB();
  if (brand) return db.getAllFromIndex("brand_notes", "by_brand", brand);
  return db.getAll("brand_notes");
}

export async function getAllBrandNotes(): Promise<BrandNote[]> {
  const db = await getDB();
  return db.getAll("brand_notes");
}

export async function saveBrandNotesFromRemote(notes: BrandNote[]): Promise<void> {
  const db = await getDB();

  // Leer todas las notas locales una vez para construir índice por remote_id
  const locals = await db.getAll("brand_notes");
  const localByRemoteId = new Map<number, number>(); // remote_id → local id
  for (const l of locals) {
    if (l.remote_id != null) localByRemoteId.set(l.remote_id, l.id!);
  }

  const tx = db.transaction("brand_notes", "readwrite");

  for (const remote of notes) {
    const remoteId = remote.id as unknown as number; // Supabase id

    if (localByRemoteId.has(remoteId)) {
      // Ya existe localmente con otro id autoincrement → actualizar ese registro
      const localId = localByRemoteId.get(remoteId)!;
      tx.store.put({ ...remote, id: localId, remote_id: remoteId });
    } else {
      // No existe localmente → insertar usando el id de Supabase como clave
      tx.store.put({ ...remote, remote_id: remoteId });
    }
  }

  await tx.done;
}

// ── Categorías (caché local) ─────────────────────────────────

export async function saveCategories(names: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("categories", "readwrite");
  await tx.store.clear();
  await Promise.all([...names.map(name => tx.store.put({ name })), tx.done]);
}

export async function getCategoriesLocal(): Promise<string[]> {
  const db = await getDB();
  const rows = await db.getAll("categories");
  return rows.map(r => r.name).sort();
}

// ── Dead letters (sync fallida permanentemente) ───────────────

export async function addDeadLetter(
  item: PendingSync,
  failCount: number,
  error: string,
  firstFailed: string,
): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();
  await db.add("dead_letters", {
    item,
    fail_count:   failCount,
    last_error:   error,
    first_failed: firstFailed,
    last_failed:  now,
  });
}

export async function getDeadLetters(): Promise<DeadLetter[]> {
  const db = await getDB();
  return db.getAll("dead_letters");
}

export async function clearDeadLetters(): Promise<void> {
  const db = await getDB();
  await db.clear("dead_letters");
}

export async function deleteDeadLetter(id: number): Promise<void> {
  const db = await getDB();
  await db.delete("dead_letters", id);
}

export async function isInitialized(): Promise<boolean> {
  const val = await getMeta("initialized");
  return val === "true";
}
