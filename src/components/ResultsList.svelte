<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { Loader2, PackageSearch, SearchX, Package } from "lucide-svelte";
  import { getStockByProduct } from "../lib/idb";
  import {
    loadThresholds,
    calcFreshness,
    type FreshnessThresholds,
  } from "../lib/freshness";
  import FreshnessDot from "./FreshnessDot.svelte";
  import SkeletonProductCard from "./SkeletonProductCard.svelte";
  import { getSubDepots } from "../lib/idb";
  import type { SubDepot } from "../lib/idb";
  import type { Product } from "../lib/supabase";

  export let products: Product[] = [];
  export let isLoading: boolean = false;
  export let depotId: number | "unassigned" | undefined = 1;
  export let query: string = "";

  // Mapa de sub-depósitos para lookup por id
  let subDepotMap = new Map<number, string>(); // id → name

  $: loadSubDepotMap(depotId);

  async function loadSubDepotMap(dId: typeof depotId) {
    if (typeof dId !== "number") {
      subDepotMap = new Map();
      return;
    }
    const sds = await getSubDepots(dId);
    subDepotMap = new Map(sds.map((s) => [s.id, s.name]));
  }
  // En modo catálogo, depotId es undefined (sin filtro), pero aún queremos
  // mostrar el botón + Stock usando el depósito activo del parent.
  export let activeDepotId: number | "unassigned" | undefined = undefined;

  // El ID que se usa para el botón + Stock (prioridad: activeDepotId si está, sino depotId)
  $: stockDepotId = activeDepotId ?? depotId;

  const dispatch = createEventDispatcher<{ addStock: { product: Product } }>();

  // ── Paginación virtual: mostrar de a PAGE_SIZE ────────────────
  const PAGE_SIZE = 50;
  let visibleCount = PAGE_SIZE;
  $: visibleProducts = products.slice(0, visibleCount);
  $: hasMore = products.length > visibleCount;

  function loadMore() {
    visibleCount = Math.min(visibleCount + PAGE_SIZE, products.length);
  }

  // Resetear paginación al cambiar la lista de productos
  $: if (products) {
    visibleCount = PAGE_SIZE;
  }

  // ── Cache de stock y frescura ────────────────────────────────
  type StockInfo = {
    units: number;
    boxes: number;
    noStockConfirmed: boolean; // tiene entrada CONTROL con fecha
  };

  let stockCache: Record<number, StockInfo> = {};
  let freshnessCache: Record<number, { status: string; label: string }> = {};
  let thresholds: FreshnessThresholds | null = null;

  onMount(async () => {
    thresholds = await loadThresholds();
  });

  // Solo cargar la porción visible para no bloquear el hilo principal
  $: if (visibleProducts.length > 0 && thresholds) loadCaches(visibleProducts);

  async function loadCaches(list: Product[]) {
    if (depotId === "unassigned") {
      stockCache = {};
      freshnessCache = {};
      return;
    }
    const t = thresholds!;
    const dId = depotId;

    // Procesar en lotes de 20 para no bloquear el event loop
    const CHUNK = 20;
    for (let i = 0; i < list.length; i += CHUNK) {
      const chunk = list.slice(i, i + CHUNK);
      const entries = await Promise.all(
        chunk.map(async (p) => {
          const lots = await getStockByProduct(p.id);
          const depot =
            dId !== undefined ? lots.filter((l) => l.depot_id === dId) : lots;

          const realLots = depot.filter((l) => l.lot_number !== "CONTROL");
          const controlLot = depot.find((l) => l.lot_number === "CONTROL");

          const units = realLots.reduce((s, l) => s + l.quantity, 0);
          const boxes = realLots.reduce((s, l) => s + (l.boxes ?? 0), 0);
          const noStockConfirmed = !!controlLot;

          const latest =
            depot.length > 0
              ? depot
                  .map((l) => new Date(l.created_at))
                  .sort((a, b) => b.getTime() - a.getTime())[0]
              : null;
          const fresh = calcFreshness(latest, t);

          return [p.id, { units, boxes, noStockConfirmed, fresh }] as const;
        }),
      );

      // Actualizar los cachés de forma reactiva luego de cada chunk
      const sc = { ...stockCache };
      const fc = { ...freshnessCache };
      for (const [id, { units, boxes, noStockConfirmed, fresh }] of entries) {
        sc[id] = { units, boxes, noStockConfirmed };
        fc[id] = { status: fresh.status, label: fresh.label };
      }
      stockCache = sc;
      freshnessCache = fc;

      // Ceder al event loop entre chunks (permite que el input responda)
      if (i + CHUNK < list.length) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  function formatStock(units: number, boxes: number): string {
    const parts: string[] = [];
    if (boxes > 0) parts.push(`${boxes} caja${boxes !== 1 ? "s" : ""}`);
    if (units > 0 || !boxes) parts.push(`${units} u.`);
    return parts.join(" + ");
  }

  function openModal(product: Product) {
    dispatch("addStock", { product });
  }

  function highlight(text: string, q: string): string {
    if (!q || q.length < 2) return text;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`(${escaped})`, "gi"), "<mark>$1</mark>");
  }
</script>

<div class="results">
  {#if isLoading}
    <div class="results-header">
      <span class="results-count">Buscando...</span>
    </div>
    <div class="product-list">
      <SkeletonProductCard count={6} />
    </div>
  {:else if products.length === 0 && query.length > 0}
    <div class="empty-state">
      <span class="empty-icon"><SearchX size={28} strokeWidth={1.5} /></span>
      <span>Sin resultados para <strong>"{query}"</strong></span>
    </div>
  {:else if products.length === 0}
    <div class="empty-state">
      <span class="empty-icon"
        ><PackageSearch size={28} strokeWidth={1.5} /></span
      >
      <span>Escribí para buscar productos</span>
    </div>
  {:else}
    <div class="results-header">
      <span class="results-count">
        {products.length} resultado{products.length !== 1 ? "s" : ""}
        {#if hasMore}
          <span class="results-shown"> — mostrando {visibleCount}</span>
        {/if}
      </span>
    </div>

    <div class="product-list">
      {#each visibleProducts as product (product.id)}
        {@const stockEntry = stockCache[product.id] ?? {
          units: 0,
          boxes: 0,
          noStockConfirmed: false,
        }}
        {@const hasStock =
          depotId !== "unassigned" &&
          depotId !== undefined &&
          (stockEntry.units > 0 || stockEntry.boxes > 0)}
        {@const fresh = freshnessCache[product.id]}

        <div class="product-card" class:has-stock={hasStock}>
          <!-- Barra lateral -->
          <div
            class="status-bar"
            class:stock-ok={hasStock}
            class:stock-no={!hasStock}
          ></div>

          <div class="product-body">
            <div class="product-top">
              <div class="product-meta">
                <span class="product-brand"
                  >{@html highlight(product.brand, query)}</span
                >
                <span class="product-code">{product.code}</span>
              </div>

              <!-- Indicador de stock -->
              <div class="stock-indicator">
                {#if depotId === undefined}
                  <span class="badge badge-gray">Catálogo</span>
                {:else if depotId === "unassigned"}
                  <span class="badge badge-gray">Sin asignar</span>
                {:else if hasStock}
                  <span class="badge badge-green"
                    >{formatStock(stockEntry.units, stockEntry.boxes)}</span
                  >
                {:else if stockEntry.noStockConfirmed}
                  <!-- Confirmado sin stock → rojo -->
                  <span class="badge badge-red">Sin stock</span>
                {:else}
                  <!-- Sin stock y sin chequeo confirmado → gris -->
                  <span class="badge badge-gray badge-unchecked">Sin stock</span
                  >
                {/if}
                {#if fresh && depotId !== "unassigned" && depotId !== undefined}
                  <FreshnessDot
                    status={fresh.status}
                    label={fresh.label}
                    size="sm"
                  />
                {/if}
              </div>
            </div>

            <div class="product-desc">
              <span class="product-name"
                >{@html highlight(product.description, query)}</span
              >
              {#if product.weight_qty}
                <span class="product-weight">{product.weight_qty}</span>
              {/if}
            </div>

            <div class="product-bottom">
              <div class="badges-row">
                <span class="badge badge-blue">{product.category}</span>
                {#if (product as any).sub_depot_id && subDepotMap.has((product as any).sub_depot_id)}
                  <span class="badge badge-sub">
                    <Layers size={9} strokeWidth={2} />
                    {subDepotMap.get((product as any).sub_depot_id)}
                  </span>
                {/if}
              </div>
              {#if typeof stockDepotId === "number"}
                <button
                  class="add-btn"
                  on:click={() => openModal(product)}
                  aria-label="Actualizar stock de {product.brand} {product.description}"
                >
                  + Stock
                </button>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Botón "Ver más" para paginación -->
    {#if hasMore}
      <div class="load-more-wrap">
        <button class="load-more-btn" on:click={loadMore}>
          Ver más ({products.length - visibleCount} restantes)
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .results {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .results-header {
    padding: 4px 2px 8px;
  }
  .results-count {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-lo, #555);
  }
  .results-shown {
    font-weight: 400;
  }

  .product-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    user-select: none;
    -webkit-user-select: none;
  }

  .product-card {
    display: flex;
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: var(--radius, 6px);
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .product-card.has-stock {
    border-color: #1c3a28;
  }

  .status-bar {
    width: 4px;
    flex-shrink: 0;
  }
  .stock-ok {
    background: var(--green, #4ade80);
  }
  .stock-no {
    background: var(--border, #2a2a2a);
  }

  .product-body {
    flex: 1;
    padding: 12px 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .product-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .product-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .product-brand {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    color: var(--amber, #f5a623);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .product-code {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-lo, #555);
    white-space: nowrap;
  }

  .product-desc {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .product-name {
    font-family: var(--font-ui, sans-serif);
    font-size: 18px;
    font-weight: 600;
    color: var(--text-hi, #f0f0f0);
    line-height: 1.2;
  }
  .product-weight {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    color: var(--text-mid, #a0a0a0);
    white-space: nowrap;
  }

  .product-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 2px;
  }

  .add-btn {
    height: 34px;
    padding: 0 14px;
    border-radius: 5px;
    border: 1.5px solid var(--amber-dim, #b57a1a);
    background: #1a1200;
    color: var(--amber, #f5a623);
    font-family: var(--font-ui, sans-serif);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.03em;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s;
  }
  .add-btn:active {
    background: #2a1e00;
  }

  /* Badges */
  .stock-indicator {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .badge-gray {
    background: var(--bg, #0d0d0d);
    color: var(--text-lo, #555);
    border: 1px solid var(--border, #2a2a2a);
  }

  /* Sin stock sin confirmar: gris apagado, sin borde */
  .badge-unchecked {
    opacity: 0.6;
    font-style: italic;
  }

  .badges-row {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }
  .badge-sub {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: #0d1a2a;
    color: #60a5fa;
    border: 1px solid #1e3a5a;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    padding: 2px 5px;
  }
  .badges-row {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }
  .badge-sub {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: #0d1a2a;
    color: #60a5fa;
    border: 1px solid #1e3a5a;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    padding: 2px 5px;
  }
  :global(mark) {
    background: #2a1e00;
    color: var(--amber, #f5a623);
    border-radius: 2px;
    padding: 0 1px;
  }

  /* Cargar más */
  .load-more-wrap {
    padding: 16px 0 8px;
    display: flex;
    justify-content: center;
  }
  .load-more-btn {
    height: 40px;
    padding: 0 24px;
    border-radius: 20px;
    border: 1.5px solid var(--border-hi, #3a3a3a);
    background: var(--bg-card, #1a1a1a);
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      border-color 0.15s,
      color 0.15s;
  }
  .load-more-btn:hover,
  .load-more-btn:active {
    border-color: var(--amber, #f5a623);
    color: var(--amber, #f5a623);
  }
  :global(.spin-icon) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
