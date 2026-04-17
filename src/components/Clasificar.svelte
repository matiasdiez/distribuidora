<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Hexagon, Loader2, Search, X, CheckSquare, Square, Check, PackageSearch } from 'lucide-svelte';
  import {
    searchProducts,
    getDepots,
    assignProductsToDepotLocal,
    countProducts,
  } from '../lib/idb';
  import { initialSync, initConnectivityListeners } from '../lib/sync';
  import { initTheme } from '../lib/themeStore';
  import SyncStatus from './SyncStatus.svelte';
  import type { Product, Depot } from '../lib/supabase';

  const DEPOT_ID    = 1;
  const PAGE_SIZE   = 80;      // productos por página

  // ── Estado ────────────────────────────────────────────────────────────────
  let allProducts:  Product[]  = [];
  let depots:       Depot[]    = [];
  let query         = '';
  let filterTab: 'all' | 'unassigned' | number = 'unassigned';
  let page          = 1;
  let appReady      = false;
  let saving        = false;
  let savedCount    = 0;

  // Selección
  let selected      = new Set<number>();   // product ids seleccionados
  let targetDepotId: number | null = null; // depósito destino elegido

  // ── Inicialización ────────────────────────────────────────────────────────
  onMount(async () => {
    initTheme();
    const cleanup = initConnectivityListeners(DEPOT_ID);
    await initialSync(DEPOT_ID);
    depots      = await getDepots();
    allProducts = await searchProducts('');
    if (depots.length > 0) targetDepotId = depots[0].id;
    appReady    = true;
    return cleanup;
  });

  // ── Filtrado reactivo ─────────────────────────────────────────────────────
  $: filtered = allProducts.filter(p => {
    const q = query.toLowerCase().trim();
    const matchesQuery = !q || (
      p.brand.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q)
    );
    const matchesTab =
      filterTab === 'all'           ? true :
      filterTab === 'unassigned'    ? p.depot_id == null :
      p.depot_id === filterTab;
    return matchesQuery && matchesTab;
  });

  $: paginated    = filtered.slice(0, page * PAGE_SIZE);
  $: hasMore      = paginated.length < filtered.length;
  $: unassigned   = allProducts.filter(p => p.depot_id == null).length;
  $: anySelected  = selected.size > 0;

  // Resetear página al cambiar filtros
  $: { query; filterTab; page = 1; }

  // ── Selección ─────────────────────────────────────────────────────────────
  function toggle(id: number) {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    selected = s;
  }

  function toggleAll() {
    if (selected.size === paginated.length) {
      selected = new Set();
    } else {
      selected = new Set(paginated.map(p => p.id));
    }
  }

  function clearSelection() {
    selected = new Set();
  }

  // ── Confirmación ──────────────────────────────────────────────────────────
  async function confirm() {
    if (!anySelected || targetDepotId === undefined) return;
    saving = true;
    try {
      const ids = [...selected];
      await assignProductsToDepotLocal(ids, targetDepotId);

      // Actualizar vista local sin re-fetch completo
      const depotId = targetDepotId;
      allProducts = allProducts.map(p =>
        ids.includes(p.id) ? { ...p, depot_id: depotId } : p
      );

      savedCount = ids.length;
      selected   = new Set();
      setTimeout(() => { savedCount = 0; }, 3000);
    } finally {
      saving = false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function depotName(depotId: number | null): string {
    if (depotId == null) return '';
    return depots.find(d => d.id === depotId)?.name ?? '';
  }

  function depotColor(depotId: number | null): string {
    if (depotId == null) return '';
    // Colores por depósito — extender según haya más depósitos
    const colors: Record<number, string> = {
      1: '#1e2d40|#60a5fa',   // azul — Cosmética
      2: '#1c3a28|#4ade80',   // verde
      3: '#2a1e00|#f5a623',   // ámbar
    };
    const pair = colors[depotId] ?? '#2a2a2a|#a0a0a0';
    return pair;
  }

  function badgeStyle(depotId: number | null): string {
    const pair = depotColor(depotId);
    const [bg, fg] = pair.split('|');
    return `background:${bg};color:${fg}`;
  }
</script>

<div class="clas-app">

  <!-- ── Header ── -->
  <header class="app-header">
    <div class="header-left">
      <a href="/" class="back-link" aria-label="Volver"><ArrowLeft size={18} strokeWidth={2} /></a>
      <div class="app-logo"><Hexagon size={14} strokeWidth={2.5} /> CLASIFICAR</div>
    </div>
    <SyncStatus />
  </header>

  {#if !appReady}
    <div class="splash">
      <Loader2 size={28} strokeWidth={1.5} class="spin" />
      <p>Cargando productos...</p>
    </div>

  {:else}
    <!-- ── Buscador ── -->
    <div class="search-wrap">
      <div class="search-box">
        <span class="s-icon"><Search size={18} strokeWidth={2} /></span>
        <input
          class="s-input"
          type="search"
          inputmode="search"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="Buscar producto o marca..."
          bind:value={query}
        />
        {#if query}
          <button class="s-clear" on:click={() => query = ''} aria-label="Limpiar"><X size={14} strokeWidth={2.5} /></button>
        {/if}
      </div>
    </div>

    <!-- ── Tabs de filtro ── -->
    <div class="tabs">
      <button
        class="tab"
        class:active={filterTab === 'unassigned'}
        on:click={() => filterTab = 'unassigned'}
      >
        Sin asignar
        {#if unassigned > 0}
          <span class="tab-count">{unassigned}</span>
        {/if}
      </button>
      <button
        class="tab"
        class:active={filterTab === 'all'}
        on:click={() => filterTab = 'all'}
      >Todos</button>
      {#each depots as depot}
        <button
          class="tab"
          class:active={filterTab === depot.id}
          on:click={() => filterTab = depot.id}
        >{depot.name}</button>
      {/each}
    </div>

    <!-- ── Barra de acciones (aparece cuando hay selección) ── -->
    {#if anySelected}
      <div class="action-bar" role="region" aria-label="Asignar seleccionados">
        <div class="action-left">
          <button class="deselect-btn" on:click={clearSelection} aria-label="Deseleccionar"><X size={14} strokeWidth={2.5} /></button>
          <span class="action-count">{selected.size} seleccionado{selected.size !== 1 ? 's' : ''}</span>
        </div>
        <div class="action-right">
          <select
            class="depot-select"
            bind:value={targetDepotId}
          >
            {#each depots as depot}
              <option value={depot.id}>{depot.name}</option>
            {/each}
            <option value={null}>Sin depósito</option>
          </select>
          <button
            class="confirm-btn"
            on:click={confirm}
            disabled={saving || targetDepotId === undefined}
          >
            {saving ? '...' : ''}{#if !saving}<Check size={16} strokeWidth={3} />{/if}
          </button>
        </div>
      </div>
    {/if}

    <!-- ── Feedback de guardado ── -->
    {#if savedCount > 0}
      <div class="saved-toast">
        <Check size={14} strokeWidth={3} /> {savedCount} producto{savedCount !== 1 ? 's' : ''} asignado{savedCount !== 1 ? 's' : ''}
      </div>
    {/if}

    <!-- ── Encabezado de lista ── -->
    <div class="list-header">
      <button class="select-all-btn" on:click={toggleAll}>
        <span class="checkbox" class:checked={selected.size === paginated.length && paginated.length > 0}>
          {#if selected.size === paginated.length && paginated.length > 0}<CheckSquare size={18} strokeWidth={2} />{:else}<Square size={18} strokeWidth={2} />{/if}
        </span>
        {selected.size === paginated.length && paginated.length > 0 ? 'Deseleccionar' : 'Seleccionar'} página
      </button>
      <span class="list-count">{filtered.length} productos</span>
    </div>

    <!-- ── Lista de productos ── -->
    {#if filtered.length === 0}
      <div class="empty">
        <PackageSearch size={36} strokeWidth={1.5} />
        <p>{query ? `Sin resultados para "${query}"` : 'No hay productos en este filtro'}</p>
      </div>
    {:else}
      <div class="product-list">
        {#each paginated as product (product.id)}
          {@const isSelected = selected.has(product.id)}
          {@const assigned   = product.depot_id != null}

          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="p-row"
            class:is-selected={isSelected}
            class:is-assigned={assigned}
            on:click={() => toggle(product.id)}
          >
            <!-- Checkbox -->
            <div class="p-check" aria-hidden="true">
              {#if isSelected}
                <span class="check-icon check-on"><CheckSquare size={18} strokeWidth={2} /></span>
              {:else}
                <span class="check-icon"><Square size={18} strokeWidth={2} /></span>
              {/if}
            </div>

            <!-- Info del producto -->
            <div class="p-info">
              <div class="p-top">
                <span class="p-brand">{product.brand}</span>
                <span class="p-code">{product.code}</span>
              </div>
              <div class="p-name">
                {product.description}
                {#if product.weight_qty}
                  <span class="p-weight">{product.weight_qty}</span>
                {/if}
              </div>
            </div>

            <!-- Badge de depósito asignado -->
            {#if assigned}
              <div
                class="depot-badge"
                style={badgeStyle(product.depot_id)}
              >
                {depotName(product.depot_id)}
              </div>
            {/if}
          </div>
        {/each}

        <!-- Cargar más -->
        {#if hasMore}
          <button class="load-more" on:click={() => page++}>
            Cargar más ({filtered.length - paginated.length} restantes)
          </button>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .clas-app {
    min-height: 100dvh;
    background: var(--bg, #0d0d0d);
    color: var(--text-hi, #f0f0f0);
    font-family: var(--font-ui, 'Barlow Condensed', sans-serif);
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .app-header {
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

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .back-link {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid var(--border, #2a2a2a);
    background: var(--bg-card, #1a1a1a);
    color: var(--text-hi, #f0f0f0);
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
  }

  .app-logo {
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: var(--amber, #f5a623);
    letter-spacing: 0.05em;
  }

  /* Splash */
  .splash {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-mono, monospace);
    font-size: 12px;
  }

  /* Search */
  .search-wrap {
    padding: 10px 12px 0;
    flex-shrink: 0;
  }

  .search-box {
    position: relative;
    display: flex;
    align-items: center;
  }

  .s-icon {
    position: absolute;
    left: 13px;
    font-size: 22px;
    color: var(--text-lo, #555);
    pointer-events: none;
  }

  .s-input {
    width: 100%;
    height: 48px;
    background: var(--bg-input, #141414);
    border: 1.5px solid var(--border, #2a2a2a);
    border-radius: 6px;
    color: var(--text-hi, #f0f0f0);
    font-family: var(--font-ui, sans-serif);
    font-size: 17px;
    padding: 0 40px 0 40px;
    outline: none;
  }

  .s-input:focus { border-color: var(--amber, #f5a623); }
  .s-input::-webkit-search-cancel-button { display: none; }

  .s-clear {
    position: absolute;
    right: 0;
    width: 48px;
    height: 48px;
    background: none;
    border: none;
    color: var(--text-mid, #a0a0a0);
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 10px 12px 0;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .tabs::-webkit-scrollbar { display: none; }

  .tab {
    flex-shrink: 0;
    height: 32px;
    padding: 0 13px;
    border-radius: 20px;
    border: 1.5px solid var(--border, #2a2a2a);
    background: var(--bg-card, #1a1a1a);
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-ui, sans-serif);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }

  .tab.active {
    border-color: var(--amber, #f5a623);
    color: var(--amber, #f5a623);
    background: #2a1e00;
  }

  .tab-count {
    background: var(--red-dim, #7f1d1d);
    color: var(--red, #f87171);
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 10px;
  }

  /* Barra de acción */
  .action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    background: #1a1200;
    border-top: 1px solid var(--amber-dim, #b57a1a);
    border-bottom: 1px solid var(--amber-dim, #b57a1a);
    position: sticky;
    top: 57px;
    z-index: 90;
    animation: slide-down 0.18s ease-out;
  }

  @keyframes slide-down {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .action-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .deselect-btn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #2a1e00;
    border: 1px solid var(--amber-dim, #b57a1a);
    color: var(--amber, #f5a623);
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  .action-count {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    color: var(--amber, #f5a623);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .action-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .depot-select {
    height: 36px;
    padding: 0 8px;
    background: var(--bg, #0d0d0d);
    border: 1.5px solid var(--amber-dim, #b57a1a);
    border-radius: 6px;
    color: var(--text-hi, #f0f0f0);
    font-family: var(--font-ui, sans-serif);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    outline: none;
    max-width: 140px;
  }

  .confirm-btn {
    width: 42px;
    height: 36px;
    border-radius: 6px;
    border: none;
    background: var(--amber, #f5a623);
    color: #000;
    font-family: var(--font-ui, sans-serif);
    font-size: 18px;
    font-weight: 700;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    flex-shrink: 0;
  }

  .confirm-btn:disabled { opacity: 0.5; }

  /* Toast de guardado */
  .saved-toast {
    margin: 8px 12px 0;
    padding: 8px 14px;
    background: #166534;
    color: var(--green, #4ade80);
    border-radius: 6px;
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-align: center;
    animation: slide-down 0.18s ease-out;
  }

  /* Encabezado de lista */
  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 4px;
    flex-shrink: 0;
  }

  .select-all-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    padding: 6px 0;
  }

  .checkbox { font-size: 16px; }
  .checkbox.checked { color: var(--amber, #f5a623); }

  .list-count {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-lo, #555);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /* Lista */
  .product-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 12px 100px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .p-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding: 10px 12px;
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 7px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.12s, background 0.12s;
  }

  .p-row.is-selected {
    border-color: var(--amber, #f5a623);
    background: #1a1200;
  }

  .p-row.is-assigned {
    border-color: #1e2d40;
  }

  .p-row.is-selected.is-assigned {
    border-color: var(--amber, #f5a623);
  }

  /* Checkbox */
  .p-check {
    flex-shrink: 0;
    width: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .check-icon {
    font-size: 20px;
    color: var(--text-lo, #555);
    line-height: 1;
  }

  .check-on { color: var(--amber, #f5a623); }

  /* Info */
  .p-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .p-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .p-brand {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    color: var(--amber, #f5a623);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .p-code {
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    color: var(--text-lo, #555);
    white-space: nowrap;
  }

  .p-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-hi, #f0f0f0);
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .p-weight {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--text-mid, #a0a0a0);
    margin-left: 5px;
  }

  /* Badge depósito */
  .depot-badge {
    flex-shrink: 0;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    padding: 3px 7px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  /* Empty */
  .empty {
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

  /* Load more */
  .load-more {
    width: 100%;
    height: 48px;
    border-radius: 7px;
    border: 1px dashed var(--border-hi, #3a3a3a);
    background: none;
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: pointer;
    margin-top: 4px;
    -webkit-tap-highlight-color: transparent;
  }

  .spin {
    font-size: 28px;
    color: var(--amber, #f5a623);
    display: inline-block;
    animation: spin 1.2s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
</style>
