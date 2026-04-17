import { createClient } from "@supabase/supabase-js";

// Tipos que reflejan el schema de Supabase
export interface Product {
  id: number;
  code: string;
  brand: string;
  description: string;
  weight_qty: string | null;
  price: number | null;
  category: string;
  depot_id: number | null; // ← depósito asignado (null = sin asignar)
  created_at: string;
}

export interface StockEntry {
  id: number;
  product_id: number;
  depot_id: number;
  lot_number: string;
  quantity: number; // unidades sueltas
  boxes: number; // cajas completas (0 si no aplica)
  expiry_date: string | null; // ISO date "YYYY-MM-DD", null si no aplica
  notes: string | null;
  created_at: string;
}

export interface Depot {
  id: number;
  name: string;
}

// Fila de historial tal como la devuelve Supabase
export interface StockHistoryRemote {
  id:           number;
  product_id:   number;
  depot_id:     number;
  lot_number:   string;
  old_quantity: number;
  old_boxes:    number;
  new_quantity: number;
  new_boxes:    number;
  move_type:    'recepcion' | 'inventario';
  changed_at:   string;
}

export interface Category {
  name: string;
}

export interface SubDepot {
  id:       number;
  depot_id: number;
  name:     string;
}

export interface BrandNoteRemote {
  id:         number;
  brand:      string;
  content:    string;
  status:     'open' | 'done';
  priority:   'low' | 'normal' | 'high';
  due_date:   string | null;
  created_at: string;
  updated_at: string;
}

export interface StockSummary {
  product_id: number;
  code: string;
  brand: string;
  description: string;
  weight_qty: string | null;
  price: number | null;
  category: string;
  depot_name: string;
  total_stock: number;
  lot_count: number;
}

// Cliente singleton — se puede usar en Svelte y en API routes
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient<{
  public: {
    Tables: {
      products: { Row: Product };
      stock_entries: { Row: StockEntry };
      depots: { Row: Depot };
    };
    Views: {
      stock_summary: { Row: StockSummary };
    };
  };
}>(supabaseUrl, supabaseKey);

// ── Helpers de lectura ────────────────────────────────────────

/** Trae todos los productos para sync inicial (paginado para superar el límite de 1000 filas de Supabase) */
export async function fetchAllProducts(): Promise<Product[]> {
  const PAGE_SIZE = 1000;
  let allProducts: Product[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("brand", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allProducts = allProducts.concat(data);
    if (data.length < PAGE_SIZE) break; // última página
    from += PAGE_SIZE;
  }

  return allProducts;
}

/** Trae todo el stock de un depósito (paginado) */
export async function fetchStockByDepot(
  depotId: number,
): Promise<StockEntry[]> {
  const PAGE_SIZE = 1000;
  let allEntries: StockEntry[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("stock_entries")
      .select("*")
      .eq("depot_id", depotId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allEntries = allEntries.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allEntries;
}

/** Trae todos los depósitos */
export async function fetchDepots(): Promise<Depot[]> {
  const { data, error } = await supabase.from("depots").select("*");
  if (error) throw error;
  return data ?? [];
}

/** Crea un depósito nuevo; devuelve el objeto creado */
export async function createDepot(name: string): Promise<Depot> {
  const { data, error } = await supabase
    .from("depots")
    .insert({ name: name.trim() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Helpers de escritura ──────────────────────────────────────

/** Agrega o actualiza un lote (upsert por product_id + depot_id + lot_number) */
export async function upsertStockEntry(
  entry: Omit<StockEntry, "id" | "created_at">,
): Promise<void> {
  const { error } = await supabase
    .from("stock_entries")
    .upsert(entry, { onConflict: "product_id,depot_id,lot_number" });

  if (error) throw error;
}

/** Inserta productos nuevos en batch */
export async function insertProducts(
  products: Omit<Product, "id" | "created_at">[],
): Promise<void> {
  const { error } = await supabase
    .from("products")
    .upsert(products, { onConflict: "code" });

  if (error) throw error;
}

/**
 * Upsert atómico: actualiza stock_entries e inserta en stock_history
 * en una sola transacción de PostgreSQL via RPC.
 *
 * Si _history es undefined, el lote es nuevo y no se genera historial.
 */
export async function upsertStockWithHistory(
  entry: Omit<StockEntry, 'id' | 'created_at'> & {
    _history?: {
      old_quantity: number;
      old_boxes:    number;
      move_type:    'recepcion' | 'inventario';
      changed_at:   string;
    };
  },
): Promise<void> {
  const hist = entry._history;

  const { error } = await supabase.rpc('upsert_stock_with_history', {
    p_product_id:   entry.product_id,
    p_depot_id:     entry.depot_id,
    p_lot_number:   entry.lot_number,
    p_quantity:     entry.quantity,
    p_boxes:        entry.boxes ?? 0,
    p_expiry_date:  entry.expiry_date ?? null,
    p_notes:        entry.notes ?? null,
    // Para lotes nuevos, estos tres van null → la función no inserta historial
    p_old_quantity: hist?.old_quantity ?? null,
    p_old_boxes:    hist?.old_boxes    ?? null,
    p_move_type:    hist?.move_type    ?? null,
    p_changed_at:   hist?.changed_at   ?? new Date().toISOString(),
  });

  if (error) throw error;
}

// ── Categories ────────────────────────────────────────────────

export async function fetchCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('name')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => r.name);
}

export async function upsertCategory(name: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .upsert({ name: name.trim() }, { onConflict: 'name' });
  if (error) throw error;
}

export async function deleteCategory(name: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('name', name);
  if (error) throw error;
}

// ── Sub-depósitos ─────────────────────────────────────────────

export async function fetchSubDepots(): Promise<SubDepot[]> {
  const { data, error } = await supabase.from('sub_depots').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createSubDepot(depotId: number, name: string): Promise<SubDepot> {
  const { data, error } = await supabase
    .from('sub_depots')
    .insert({ depot_id: depotId, name: name.trim() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function assignProductsToSubDepot(
  productIds: number[],
  subDepotId: number | null,
): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ sub_depot_id: subDepotId })
    .in('id', productIds);
  if (error) throw error;
}

// ── Notas / Tareas de marca ───────────────────────────────────

export async function fetchBrandNotes(): Promise<BrandNoteRemote[]> {
  const { data, error } = await supabase
    .from('brand_notes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertBrandNote(
  note: Omit<BrandNoteRemote, 'id' | 'created_at' | 'updated_at'> & { id?: number },
): Promise<BrandNoteRemote> {
  const { id, ...rest } = note;
  if (id) {
    const { data, error } = await supabase
      .from('brand_notes')
      .update(rest)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('brand_notes')
    .insert(rest)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBrandNoteRemote(id: number): Promise<void> {
  const { error } = await supabase.from('brand_notes').delete().eq('id', id);
  if (error) throw error;
}

/** Asigna un depósito a una lista de productos (bulk) */
export async function assignProductsToDepot(
  productIds: number[],
  depotId: number | null,
): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ depot_id: depotId })
    .in("id", productIds);

  if (error) throw error;
}
