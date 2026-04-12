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
