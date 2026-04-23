<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '../lib/supabase';
  import type { Product, StockEntry, Depot } from '../lib/supabase';

  // Estado
  let products:    Product[]    = [];
  let stockMap:    Record<number, StockEntry[]> = {};
  let depots:      Depot[]      = [];
  let categories:  string[]     = [];
  let loading      = true;
  let error        = '';
  let query        = '';
  let activeCategory = 'Todos';
  let lastFetch: string | null = null;

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    error   = '';
    try {
      // Productos
      const { data: prods, error: prodErr } = await supabase
        .from('products')
        .select('*')
        .order('brand');
      if (prodErr) throw prodErr;
      products = prods ?? [];

      // Categorías únicas
      categories = [...new Set(products.map(p => p.category))].sort();

      // Depósitos
      const { data: deps } = await supabase.from('depots').select('*');
      depots = deps ?? [];

      // Stock de todos los productos
      const { data: stock, error: stockErr } = await supabase
        .from('stock_entries')
        .select('*');
      if (stockErr) throw stockErr;

      // Agrupar stock por product_id
      stockMap = {};
      for (const entry of (stock ?? [])) {
        if (!stockMap[entry.product_id]) stockMap[entry.product_id] = [];
        stockMap[entry.product_id].push(entry);
      }

      lastFetch = new Date().toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch (e: any) {
      error = e.message ?? 'Error al cargar datos';
    } finally {
      loading = false;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function totalStock(productId: number, depotId?: number): number {
    const entries = stockMap[productId] ?? [];
    return entries
      .filter(e => depotId == null || e.depot_id === depotId)
      .reduce((s, e) => s + e.quantity, 0);
  }

  function lastUpdate(productId: number): string {
    const entries = stockMap[productId] ?? [];
    if (entries.length === 0) return '—';
    const latest = entries
      .map(e => new Date(e.created_at))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return latest.toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  // ── Filtrado reactivo ─────────────────────────────────────────────────────

  $: filtered = products.filter(p => {
    const cat = activeCategory === 'Todos' || p.category === activeCategory;
    if (!cat) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      p.brand.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q)
    );
  });

  $: totalResults = filtered.length;
  $: withStock    = filtered.filter(p => totalStock(p.id) > 0).length;
</script>

<div class="pub-wrap">

  <!-- Header -->
  <header class="pub-header">
    <div class="pub-logo">⬡ DEPÓSITO</div>
    <div class="pub-meta">
      {#if lastFetch}
        <span class="pub-sync">Datos al {lastFetch}</span>
      {/if}
      <button class="refresh-btn" on:click={loadData} disabled={loading}>
        <span class:spin={loading}>⟳</span>
      </button>
    </div>
  </header>

  <!-- Buscador -->
  <div class="pub-search-wrap">
    <div class="search-row">
      <div class="search-box">
        <span class="search-icon">⌕</span>
        <input
          class="pub-input"
          type="search"
          inputmode="search"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="Buscar producto, marca..."
          bind:value={query}
        />
        {#if query}
          <button class="clear-btn" on:click={() => query = ''}>✕</button>
        {/if}
      </div>
    </div>

    <!-- Filtros de categoría -->
    {#if categories.length > 0}
      <div class="pub-filters">
        <button
          class="filter-pill"
          class:active={activeCategory === 'Todos'}
          on:click={() => activeCategory = 'Todos'}
        >Todos</button>
        {#each categories as cat}
          <button
            class="filter-pill"
            class:active={activeCategory === cat}
            on:click={() => activeCategory = cat}
          >{cat}</button>
        {/each}
      </div>
    {/if}

    <!-- Resumen -->
    {#if !loading}
      <div class="pub-summary">
        <span class="sum-total">{totalResults} productos</span>
        <span class="sum-dot">·</span>
        <span class="sum-stock">{withStock} con stock</span>
      </div>
    {/if}
  </div>

  <!-- Cuerpo -->
  {#if loading}
    <div class="pub-empty">
      <span class="spin-big">⟳</span>
      <p>Cargando...</p>
    </div>

  {:else if error}
    <div class="pub-empty pub-error">
      <span>⚠</span>
      <p>{error}</p>
      <button class="retry-btn" on:click={loadData}>Reintentar</button>
    </div>

  {:else if filtered.length === 0}
    <div class="pub-empty">
      <span>∅</span>
      <p>Sin resultados para <strong>"{query}"</strong></p>
    </div>

  {:else}
    <div class="pub-list">
      {#each filtered as product (product.id)}
        {@const stock = totalStock(product.id)}
        {@const updated = lastUpdate(product.id)}
        {@const hasStock = stock > 0}

        <div class="pub-card" class:has-stock={hasStock}>
          <div class="pub-bar" class:ok={hasStock} class:no={!hasStock}></div>

          <div class="pub-body">
            <!-- Fila top: marca + badge de stock -->
            <div class="pub-top">
              <span class="pub-brand">{product.brand}</span>
              <div class="pub-stock-badge">
                {#if hasStock}
                  <span class="badge badge-green">{stock} u.</span>
                {:else}
                  <span class="badge badge-red">Sin stock</span>
                {/if}
              </div>
            </div>

            <!-- Descripción -->
            <div class="pub-desc">
              <span class="pub-name">{product.description}</span>
              {#if product.weight_qty}
                <span class="pub-weight">{product.weight_qty}</span>
              {/if}
            </div>

            <!-- Fila bottom: categoría + última actualización -->
            <div class="pub-bottom">
              <span class="badge badge-blue">{product.category}</span>
              {#if hasStock}
                <span class="pub-updated">Actualizado {updated}</span>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

</div>

<style>
  .pub-wrap {
    min-height: 100dvh;
    background: var(--bg, #0d0d0d);
    color: var(--text-hi, #f0f0f0);
    font-family: var(--font-ui, 'Barlow Condensed', sans-serif);
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .pub-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border, #2a2a2a);
    position: sticky;
    top: 0;
    background: var(--bg, #0d0d0d);
    z-index: 100;
  }

  .pub-logo {
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: var(--amber, #f5a623);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .pub-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pub-sync {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-lo, #555);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .refresh-btn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border, #2a2a2a);
    color: var(--text-mid, #a0a0a0);
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  /* Search */
  .pub-search-wrap {
    padding: 12px 12px 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .search-row { position: relative; }

  .search-box {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 13px;
    font-size: 22px;
    color: var(--text-lo, #555);
    pointer-events: none;
  }

  .pub-input {
    width: 100%;
    height: 52px;
    background: var(--bg-input, #141414);
    border: 1.5px solid var(--border, #2a2a2a);
    border-radius: 6px;
    color: var(--text-hi, #f0f0f0);
    font-family: var(--font-ui, sans-serif);
    font-size: 18px;
    padding: 0 40px 0 40px;
    outline: none;
  }

  .pub-input:focus { border-color: var(--amber, #f5a623); }
  .pub-input::-webkit-search-cancel-button { display: none; }

  .clear-btn {
    position: absolute;
    right: 0;
    width: 52px;
    height: 52px;
    background: none;
    border: none;
    color: var(--text-mid, #a0a0a0);
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Filters */
  .pub-filters {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }
  .pub-filters::-webkit-scrollbar { display: none; }

  .filter-pill {
    flex-shrink: 0;
    height: 34px;
    padding: 0 14px;
    border-radius: 20px;
    border: 1.5px solid var(--border, #2a2a2a);
    background: var(--bg-card, #1a1a1a);
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-ui, sans-serif);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }

  .filter-pill.active {
    border-color: var(--amber, #f5a623);
    color: var(--amber, #f5a623);
    background: var(--amber-bg, #2a1e00);
  }

  /* Summary */
  .pub-summary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 2px 8px;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .sum-total  { color: var(--text-mid, #a0a0a0); }
  .sum-dot    { color: var(--border-hi, #3a3a3a); }
  .sum-stock  { color: var(--green, #4ade80); }

  /* Lista */
  .pub-list {
    padding: 0 12px 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pub-card {
    display: flex;
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 6px;
    overflow: hidden;
  }

  .pub-card.has-stock { border-color: #1c3a28; }

  .pub-bar {
    width: 4px;
    flex-shrink: 0;
  }
  .pub-bar.ok { background: var(--green, #4ade80); }
  .pub-bar.no { background: var(--border, #2a2a2a); }

  .pub-body {
    flex: 1;
    padding: 11px 12px 9px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .pub-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .pub-brand {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    color: var(--amber, #f5a623);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .pub-desc {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }

  .pub-name {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-hi, #f0f0f0);
    line-height: 1.2;
  }

  .pub-weight {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    color: var(--text-mid, #a0a0a0);
  }

  .pub-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px;
  }

  .pub-updated {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-lo, #555);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  /* Empty / error */
  .pub-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 60px 24px;
    color: var(--text-lo, #555);
    font-size: 15px;
    text-align: center;
  }

  .pub-error { color: var(--red, #f87171); }

  .spin-big {
    font-size: 36px;
    color: var(--amber, #f5a623);
    animation: spin 1.2s linear infinite;
    display: inline-block;
  }

  .retry-btn {
    margin-top: 8px;
    padding: 8px 20px;
    border-radius: 6px;
    border: 1px solid var(--border-hi, #3a3a3a);
    background: var(--bg-card, #1a1a1a);
    color: var(--text-hi, #f0f0f0);
    font-size: 15px;
    cursor: pointer;
  }

  /* Shared badges (duplicated here for standalone page) */
  :global(.badge) {
    display: inline-flex;
    align-items: center;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  :global(.badge-green) { background: var(--green-dim, #166534); color: var(--green, #4ade80); }
  :global(.badge-red)   { background: #7f1d1d; color: #f87171; }
  :global(.badge-blue)  { background: var(--bg-card, #1e2d40); color: var(--blue, #60a5fa); }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  .spin { display: inline-block; animation: spin 1s linear infinite; }
</style>
