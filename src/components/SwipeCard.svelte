<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { getStockByProduct } from "../lib/idb";
  import { ArrowLeft, ArrowRight, Check } from "lucide-svelte";
  import StockModal from "./StockModal.svelte";
  import type { Product, StockEntry } from "../lib/supabase";

  export let product: Product;
  export let depotId: number = 1;
  export let index: number = 0;
  export let total: number = 1;

  const dispatch = createEventDispatcher<{
    saved: { product_id: number };
  }>();

  // ── Stock actual ──────────────────────────────────────────────
  let lots: StockEntry[] = [];
  let totalUnits = 0;
  let totalBoxes = 0;

  $: loadLots(product.id);

  async function loadLots(pid: number) {
    lots = await getStockByProduct(pid);
    const depot = lots.filter((l) => l.depot_id === depotId && l.lot_number !== "CONTROL");
    totalUnits = depot.reduce((s, l) => s + l.quantity, 0);
    totalBoxes = depot.reduce((s, l) => s + (l.boxes ?? 0), 0);
  }

  // Lotes reales del depósito (excluye CONTROL)
  $: depotLots = lots.filter((l) => l.depot_id === depotId && l.lot_number !== "CONTROL");
  $: hasStock   = totalUnits > 0 || totalBoxes > 0;

  function formatStock(units: number, bxs: number): string {
    const parts: string[] = [];
    if (bxs > 0)           parts.push(`${bxs} caja${bxs !== 1 ? "s" : ""}`);
    if (units > 0 || !bxs) parts.push(`${units} u.`);
    return parts.join(" + ");
  }

  function formatExpiry(iso: string): string {
    const [y, m] = iso.split("-");
    return `${m}/${y.slice(2)}`;
  }

  function daysUntil(iso: string): number {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  }

  // ── Modal ─────────────────────────────────────────────────────
  let modalOpen = false;
  let saved     = false;

  function openModal() { modalOpen = true; }
  function closeModal() { modalOpen = false; }

  async function handleSaved(e: CustomEvent<{ product_id: number }>) {
    modalOpen = false;
    await loadLots(product.id);
    dispatch("saved", e.detail);
    saved = true;
    setTimeout(() => { saved = false; }, 2000);
  }
</script>

<div class="card" class:has-stock={hasStock}>

  <!-- Posición + feedback guardado -->
  <div class="card-pos">
    <span class="pos-text">{index + 1} / {total}</span>
    {#if saved}
      <span class="pos-saved"><Check size={11} strokeWidth={3} /> Guardado</span>
    {/if}
  </div>

  <!-- Cabecera: marca + badge stock -->
  <div class="card-header">
    <span class="card-brand">{product.brand}</span>
    <div class="card-stock-badge" class:ok={hasStock} class:empty={!hasStock}>
      {hasStock ? formatStock(totalUnits, totalBoxes) : "Sin stock"}
    </div>
  </div>

  <!-- Nombre + peso -->
  <div class="card-name">{product.description}</div>
  {#if product.weight_qty}
    <div class="card-weight">{product.weight_qty}</div>
  {/if}

  <!-- Precio -->
  {#if product.price}
    <div class="card-price">
      $ {product.price.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
    </div>
  {/if}

  <!-- Lotes actuales -->
  {#if depotLots.length > 0}
    <div class="card-lots">
      <p class="lots-label">Lotes en depósito</p>
      <div class="lots-list">
        {#each depotLots as lot}
          {@const days = lot.expiry_date ? daysUntil(lot.expiry_date) : null}
          <div class="lot-row">
            <span class="lot-num">{lot.lot_number}</span>
            <span class="lot-qty">{formatStock(lot.quantity, lot.boxes ?? 0)}</span>
            <span
              class="lot-expiry"
              class:expiry-soon={days !== null && days <= 30}
              class:expiry-urgent={days !== null && days <= 7}
            >
              {#if lot.expiry_date}
                vence {formatExpiry(lot.expiry_date)}
              {:else}
                {new Date(lot.created_at).toLocaleDateString("es-AR", {
                  day: "2-digit", month: "2-digit",
                })}
              {/if}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="card-no-lots">Sin lotes registrados</div>
  {/if}

  <!-- Botón que abre StockModal (idéntico al de Buscar) -->
  <button class="add-stock-btn" on:click={openModal}>
    + Stock
  </button>

  <!-- Hint de swipe -->
  <div class="swipe-hint">
    {#if index > 0}<span><ArrowLeft size={12} strokeWidth={2} /> anterior</span>{:else}<span></span>{/if}
    {#if index < total - 1}<span>siguiente <ArrowRight size={12} strokeWidth={2} /></span>{:else}<span></span>{/if}
  </div>
</div>

<!-- StockModal: exactamente el mismo que usa la vista Buscar -->
<StockModal
  {product}
  open={modalOpen}
  {depotId}
  on:close={closeModal}
  on:saved={handleSaved}
/>

<style>
  .card {
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 16px;
    padding: 20px 18px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    box-sizing: border-box;
    user-select: none;
    transition: border-color 0.2s;
  }
  .card.has-stock { border-color: #1c3a28; }

  /* Posición */
  .card-pos { display: flex; align-items: center; justify-content: space-between; }
  .pos-text { font-family: var(--font-mono, monospace); font-size: 10px; color: var(--text-lo, #555); letter-spacing: 0.08em; text-transform: uppercase; }
  .pos-saved { font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 700; color: var(--green, #4ade80); animation: fade-in 0.2s ease; }

  /* Header */
  .card-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .card-brand { font-family: var(--font-mono, monospace); font-size: 13px; font-weight: 700; color: var(--amber, #f5a623); text-transform: uppercase; letter-spacing: 0.06em; }
  .card-stock-badge { font-family: var(--font-mono, monospace); font-size: 13px; font-weight: 700; padding: 3px 10px; border-radius: 20px; border: 1.5px solid; white-space: nowrap; }
  .card-stock-badge.ok    { color: var(--green, #4ade80); border-color: var(--green, #4ade80); background: #0d1f14; }
  .card-stock-badge.empty { color: var(--text-lo, #555);  border-color: var(--border, #2a2a2a); background: transparent; }

  /* Producto */
  .card-name   { font-family: var(--font-ui, sans-serif); font-size: 26px; font-weight: 700; color: var(--text-hi, #f0f0f0); line-height: 1.15; }
  .card-weight { font-family: var(--font-mono, monospace); font-size: 13px; color: var(--text-mid, #a0a0a0); }
  .card-price  { font-family: var(--font-mono, monospace); font-size: 18px; font-weight: 700; color: var(--green, #4ade80); }

  /* Lotes */
  .card-lots { background: var(--bg, #0d0d0d); border-radius: 8px; padding: 10px 12px; border: 1px solid var(--border, #2a2a2a); }
  .lots-label { font-family: var(--font-mono, monospace); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-lo, #555); margin-bottom: 6px; }
  .lots-list  { display: flex; flex-direction: column; gap: 5px; }
  .lot-row    { display: flex; align-items: center; gap: 8px; }
  .lot-num    { font-family: var(--font-mono, monospace); font-size: 12px; font-weight: 700; color: var(--amber, #f5a623); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lot-qty    { font-family: var(--font-mono, monospace); font-size: 12px; font-weight: 700; color: var(--green, #4ade80); white-space: nowrap; }
  .lot-expiry { font-family: var(--font-mono, monospace); font-size: 10px; color: var(--text-lo, #555); white-space: nowrap; }
  .lot-expiry.expiry-soon   { color: var(--amber, #f5a623); font-weight: 700; }
  .lot-expiry.expiry-urgent { color: var(--red, #f87171);   font-weight: 700; }

  .card-no-lots { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--text-lo, #555); text-align: center; padding: 8px 0; }

  /* Botón */
  .add-stock-btn {
    width: 100%;
    height: 52px;
    border-radius: 10px;
    border: 1.5px solid var(--amber-dim, #b57a1a);
    background: #1a1200;
    color: var(--amber, #f5a623);
    font-family: var(--font-ui, sans-serif);
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.03em;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s;
    margin-top: auto;
  }
  .add-stock-btn:active { background: #2a1e00; }

  /* Swipe hint */
  .swipe-hint { display: flex; justify-content: space-between; font-family: var(--font-mono, monospace); font-size: 10px; color: var(--text-lo, #555); letter-spacing: 0.05em; padding-top: 2px; }

  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
</style>
