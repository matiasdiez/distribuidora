<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { getTotalStock, getStockByProduct } from '../lib/idb';
  import { loadThresholds, calcFreshness, type FreshnessThresholds } from '../lib/freshness';
  import FreshnessDot from './FreshnessDot.svelte';
  import type { Product } from '../lib/supabase';

  export let products: Product[] = [];
  export let isLoading: boolean  = false;
  export let depotId: number     = 1;
  export let query: string       = '';

  const dispatch = createEventDispatcher<{
    addStock: { product: Product };
  }>();

  let stockCache:     Record<number, number>    = {};
  let freshnessCache: Record<number, { status: string; label: string }> = {};
  let thresholds: FreshnessThresholds | null = null;

  onMount(async () => {
    thresholds = await loadThresholds();
  });

  $: if (products.length > 0 && thresholds) loadCaches(products);

  async function loadCaches(list: Product[]) {
    const t = thresholds!;
    const entries = await Promise.all(
      list.map(async p => {
        const lots  = await getStockByProduct(p.id);
        const depot = lots.filter(l => l.depot_id === depotId);
        const total = depot.reduce((s, l) => s + l.quantity, 0);

        // Fecha más reciente entre todos los lotes del depósito
        const latest = depot.length > 0
          ? depot.map(l => new Date(l.created_at)).sort((a, b) => b.getTime() - a.getTime())[0]
          : null;
        const fresh = calcFreshness(latest, t);

        return [p.id, { total, fresh }] as const;
      })
    );

    const sc: Record<number, number> = {};
    const fc: Record<number, { status: string; label: string }> = {};
    for (const [id, { total, fresh }] of entries) {
      sc[id] = total;
      fc[id] = { status: fresh.status, label: fresh.label };
    }
    stockCache     = sc;
    freshnessCache = fc;
  }

  function openModal(product: Product) {
    dispatch('addStock', { product });
  }

  function highlight(text: string, q: string): string {
    if (!q || q.length < 2) return text;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  }
</script>

<div class="results">
  {#if isLoading}
    <div class="empty-state">
      <span class="empty-icon">⟳</span>
      <span>Buscando...</span>
    </div>

  {:else if products.length === 0 && query.length > 0}
    <div class="empty-state">
      <span class="empty-icon">∅</span>
      <span>Sin resultados para <strong>"{query}"</strong></span>
    </div>

  {:else if products.length === 0}
    <div class="empty-state">
      <span class="empty-icon">📦</span>
      <span>Escribí para buscar productos</span>
    </div>

  {:else}
    <div class="results-header">
      <span class="results-count">{products.length} resultado{products.length !== 1 ? 's' : ''}</span>
    </div>

    <div class="product-list">
      {#each products as product (product.id)}
        {@const stock = stockCache[product.id] ?? 0}
        {@const hasStock = stock > 0}
        {@const fresh = freshnessCache[product.id]}

        <div class="product-card" class:has-stock={hasStock}>

          <!-- Barra lateral de estado -->
          <div class="status-bar" class:stock-ok={hasStock} class:stock-no={!hasStock}></div>

          <!-- Contenido principal -->
          <div class="product-body">
            <div class="product-top">
              <!-- Marca + código -->
              <div class="product-meta">
                <span class="product-brand">
                  {@html highlight(product.brand, query)}
                </span>
                <span class="product-code">{product.code}</span>
              </div>

              <!-- Indicador de stock + frescura -->
              <div class="stock-indicator">
                {#if hasStock}
                  <span class="badge badge-green">{stock} u.</span>
                {:else}
                  <span class="badge badge-red">Sin stock</span>
                {/if}
                {#if fresh}
                  <FreshnessDot
                    status={fresh.status}
                    label={fresh.label}
                    size="sm"
                  />
                {/if}
              </div>
            </div>

            <!-- Descripción del producto -->
            <div class="product-desc">
              <span class="product-name">
                {@html highlight(product.description, query)}
              </span>
              {#if product.weight_qty}
                <span class="product-weight">{product.weight_qty}</span>
              {/if}
            </div>

            <!-- Fila inferior: categoría + botón agregar -->
            <div class="product-bottom">
              <span class="badge badge-blue">{product.category}</span>
              <button
                class="add-btn"
                on:click={() => openModal(product)}
                aria-label="Agregar stock de {product.brand} {product.description}"
              >
                + Stock
              </button>
            </div>
          </div>

        </div>
      {/each}
    </div>
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

  /* Lista de productos */
  .product-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Card individual */
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

  /* Barra lateral de color */
  .status-bar {
    width: 4px;
    flex-shrink: 0;
  }

  .stock-ok { background: var(--green, #4ade80); }
  .stock-no { background: var(--border, #2a2a2a); }

  /* Body */
  .product-body {
    flex: 1;
    padding: 12px 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  /* Fila top */
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

  /* Descripción */
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

  /* Fila inferior */
  .product-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 2px;
  }

  /* Botón agregar stock */
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

  /* Resaltado de búsqueda */
  :global(mark) {
    background: #2a1e00;
    color: var(--amber, #f5a623);
    border-radius: 2px;
    padding: 0 1px;
  }

  /* Indicador de stock */
  .stock-indicator {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
