<script lang="ts">
  import { onMount } from "svelte";
  import { Search, X, Tag, SlidersHorizontal, Layers, ChevronDown } from 'lucide-svelte';
  import { searchProducts, getCategoriesLocal, getBrands, getSubDepots } from "../lib/idb";
  import type { Product } from "../lib/supabase";
  import type { SubDepot } from "../lib/idb";

  export let onResults: (products: Product[]) => void = () => {};
  export let onSearchStart: () => void = () => {};  // notifica al padre que empezó una búsqueda
  export let onCategoryChange: (cat: string) => void = () => {};
  export let depotId: number | "unassigned" | undefined = 1;
  export let query = "";

  let categories: string[] = [];
  let allBrands: string[]  = [];
  let subDepots: SubDepot[] = [];
  let activeCategory    = "Todos";
  let activeSubDepotId: number | null | undefined = undefined;
  let showFilters       = false; // panel de filtros expandible
  let debounceTimer: ReturnType<typeof setTimeout>;

  // ── Marca fija ────────────────────────────────────────────────
  let pinnedBrand: string | null = null;

  // ── Autocomplete ──────────────────────────────────────────────
  let showSuggestions = false;
  let suggestions: string[] = [];
  let inputEl: HTMLInputElement;

  $: effectiveQuery = pinnedBrand
    ? (query ? pinnedBrand + " " + query : pinnedBrand)
    : query;

  $: {
    if (query && !pinnedBrand) {
      const lq = query.toLowerCase();
      suggestions = allBrands
        .filter(b => b.toLowerCase().startsWith(lq) || b.toLowerCase().includes(lq))
        .slice(0, 6);
      showSuggestions = suggestions.length > 0;
    } else {
      suggestions     = [];
      showSuggestions = false;
    }
  }

  // Cuenta de filtros activos (para badge en botón)
  $: activeFiltersCount = (activeCategory !== "Todos" ? 1 : 0) +
                          (activeSubDepotId !== undefined ? 1 : 0);

  onMount(async () => {
    [categories, allBrands] = await Promise.all([getCategoriesLocal(), getBrands()]);
    if (typeof depotId === 'number') {
      subDepots = await getSubDepots(depotId);
    }
    await runSearch();
  });

  async function runSearch() {
    onSearchStart();                              // padre pone isLoading = true
    try {
      const cat     = activeCategory === "Todos" ? undefined : activeCategory;
      const results = await searchProducts(effectiveQuery, cat, depotId, activeSubDepotId);
      onResults(results);                         // padre pone isLoading = false
    } catch (err) {
      console.error('[buscador] runSearch error:', err);
      onResults([]);                              // asegurar que el padre limpie el estado
    }
  }

  function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 150);
  }

  function pinBrand(brand: string) {
    pinnedBrand     = brand;
    query           = "";
    showSuggestions = false;
    setTimeout(() => inputEl?.focus(), 30);
    runSearch();
  }

  function unpinBrand() { pinnedBrand = null; query = ""; runSearch(); }
  function clearAll()   { pinnedBrand = null; query = ""; runSearch(); }

  function handleBlur() {
    setTimeout(() => { showSuggestions = false; }, 150);
  }

  async function selectCategory(cat: string) {
    activeCategory = cat;
    onCategoryChange(cat);
    await runSearch();
  }

  function selectSubDepot(id: number | null | undefined) {
    activeSubDepotId = id;
    runSearch();
  }

  function clearFilters() {
    activeCategory   = "Todos";
    activeSubDepotId = undefined;
    onCategoryChange("Todos");
    runSearch();
  }
</script>

<div class="buscador">

  <!-- ── Campo de búsqueda ────────────────────────────────────── -->
  <div class="search-row">
    <div class="search-wrap" class:has-pin={!!pinnedBrand}>
      {#if !pinnedBrand}
        <span class="search-icon"><Search size={20} strokeWidth={2} /></span>
      {/if}

      {#if pinnedBrand}
        <div class="brand-pin">
          <Tag size={11} strokeWidth={2.5} />
          <span class="pin-label">{pinnedBrand}</span>
          <button class="pin-remove" on:click={unpinBrand} aria-label="Quitar marca">
            <X size={11} strokeWidth={3} />
          </button>
        </div>
      {/if}

      <input
        bind:this={inputEl}
        class="search-input"
        class:with-pin={!!pinnedBrand}
        type="search"
        inputmode="search"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder={pinnedBrand ? "Filtrar productos..." : "Marca, producto o código..."}
        bind:value={query}
        on:input={handleInput}
        on:blur={handleBlur}
      />

      {#if query || pinnedBrand}
        <button class="clear-btn" on:click={clearAll} aria-label="Limpiar">
          <X size={16} strokeWidth={2.5} />
        </button>
      {/if}
    </div>

    <!-- Botón filtros con badge de cantidad activa -->
    <button
      class="filter-toggle"
      class:has-active={activeFiltersCount > 0}
      on:click={() => (showFilters = !showFilters)}
      aria-label="Filtros"
      aria-expanded={showFilters}
    >
      <SlidersHorizontal size={18} strokeWidth={2} />
      {#if activeFiltersCount > 0}
        <span class="filter-badge">{activeFiltersCount}</span>
      {/if}
    </button>
  </div>

  <!-- ── Sugerencias de marcas ─────────────────────────────────── -->
  {#if showSuggestions}
    <div class="suggestions" role="listbox">
      {#each suggestions as brand}
        <button
          class="suggestion-item"
          role="option"
          aria-selected="false"
          on:mousedown|preventDefault={() => pinBrand(brand)}
        >
          <Tag size={12} strokeWidth={2} class="sug-icon" />
          <span class="sug-brand">{brand}</span>
          <span class="sug-hint">fijar marca</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- ── Panel de filtros (colapsable) ────────────────────────── -->
  {#if showFilters}
    <div class="filter-panel">
      <!-- Categorías -->
      {#if categories.length > 0}
        <div class="filter-section">
          <span class="filter-section-label">Categoría</span>
          <div class="filter-pills">
            <button
              class="filter-pill"
              class:active={activeCategory === "Todos"}
              on:click={() => selectCategory("Todos")}
            >Todos</button>
            {#each categories as cat}
              <button
                class="filter-pill"
                class:active={activeCategory === cat}
                on:click={() => selectCategory(cat)}
              >{cat}</button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Sub-depósitos -->
      {#if subDepots.length > 0}
        <div class="filter-section">
          <span class="filter-section-label">
            <Layers size={11} strokeWidth={2} /> Sector
          </span>
          <div class="filter-pills">
            <button
              class="filter-pill"
              class:active={activeSubDepotId === undefined}
              on:click={() => selectSubDepot(undefined)}
            >Todos</button>
            <button
              class="filter-pill"
              class:active={activeSubDepotId === null}
              on:click={() => selectSubDepot(null)}
            >Sin sector</button>
            {#each subDepots as sd}
              <button
                class="filter-pill"
                class:active={activeSubDepotId === sd.id}
                on:click={() => selectSubDepot(sd.id)}
              >{sd.name}</button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Botón limpiar filtros -->
      {#if activeFiltersCount > 0}
        <button class="clear-filters-btn" on:click={clearFilters}>
          <X size={12} strokeWidth={2.5} /> Limpiar filtros
        </button>
      {/if}
    </div>
  {/if}

  <!-- Chips de filtros activos (visibles aunque el panel esté cerrado) -->
  {#if activeFiltersCount > 0 && !showFilters}
    <div class="active-chips">
      {#if activeCategory !== "Todos"}
        <span class="chip">
          {activeCategory}
          <button class="chip-remove" on:click={() => selectCategory("Todos")}><X size={9} strokeWidth={3} /></button>
        </span>
      {/if}
      {#if activeSubDepotId !== undefined}
        <span class="chip chip-sector">
          <Layers size={9} strokeWidth={2} />
          {activeSubDepotId === null ? "Sin sector" : subDepots.find(s => s.id === activeSubDepotId)?.name ?? "Sector"}
          <button class="chip-remove" on:click={() => selectSubDepot(undefined)}><X size={9} strokeWidth={3} /></button>
        </span>
      {/if}
    </div>
  {/if}

</div>

<style>
  .buscador { display: flex; flex-direction: column; gap: 8px; }

  /* ── Campo + botón filtros ─────────────────────────────────── */
  .search-row { display: flex; gap: 8px; align-items: stretch; }

  .search-wrap {
    flex: 1; position: relative; display: flex; align-items: center;
    background: var(--bg-card); border: 1.5px solid var(--border);
    border-radius: var(--radius, 8px); overflow: hidden;
    transition: border-color 0.15s; min-width: 0;
  }
  .search-wrap:focus-within { border-color: var(--amber); }
  .search-wrap.has-pin      { border-color: var(--amber-dim); }

  .search-icon {
    position: absolute; left: 13px; color: var(--text-lo);
    pointer-events: none; display: flex; align-items: center;
  }
  .search-input {
    flex: 1; min-width: 0; height: var(--touch, 52px);
    padding: 0 48px 0 42px; background: transparent; border: none; outline: none;
    color: var(--text-hi); font-family: var(--font-ui); font-size: 18px;
  }
  .search-input.with-pin  { padding-left: 10px; font-size: 16px; }
  .search-input::placeholder { color: var(--text-lo); }
  .search-input::-webkit-search-decoration,
  .search-input::-webkit-search-cancel-button { display: none; }

  .clear-btn {
    position: absolute; right: 0; width: 52px; height: 52px;
    background: none; border: none; color: var(--text-mid);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  /* Botón filtros */
  .filter-toggle {
    position: relative; flex-shrink: 0; width: 52px; height: 52px;
    border-radius: 8px; border: 1.5px solid var(--border);
    background: var(--bg-card); color: var(--text-mid);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, color 0.15s;
  }
  .filter-toggle.has-active {
    border-color: var(--amber); color: var(--amber); background: #2a1e00;
  }
  [data-theme="light"] .filter-toggle.has-active { background: #fff8ec; }

  .filter-badge {
    position: absolute; top: 6px; right: 6px; width: 15px; height: 15px;
    border-radius: 50%; background: var(--amber); color: #000;
    font-family: var(--font-mono); font-size: 9px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; line-height: 1;
  }

  /* ── Marca fija ─────────────────────────────────────────────── */
  .brand-pin {
    display: flex; align-items: center; gap: 5px; margin-left: 10px;
    padding: 5px 4px 5px 8px; background: #2a1e00;
    border: 1.5px solid var(--amber); border-radius: 20px; flex-shrink: 0;
    max-width: 52%; animation: pop-in 0.15s ease-out;
  }
  [data-theme="light"] .brand-pin { background: #fff8ec; }
  .pin-label {
    font-family: var(--font-mono); font-size: 12px; font-weight: 700;
    color: var(--amber); text-transform: uppercase; letter-spacing: 0.04em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .pin-remove {
    width: 20px; height: 20px; border-radius: 50%; border: none;
    background: #3a2800; color: var(--amber); display: flex;
    align-items: center; justify-content: center; cursor: pointer;
    flex-shrink: 0; -webkit-tap-highlight-color: transparent; padding: 0;
  }
  [data-theme="light"] .pin-remove { background: #fde68a; }

  /* ── Sugerencias ─────────────────────────────────────────────── */
  .suggestions {
    display: flex; flex-direction: column; background: var(--bg-card);
    border: 1.5px solid var(--amber); border-radius: 8px; overflow: hidden;
    animation: slide-down 0.12s ease-out;
  }
  .suggestion-item {
    display: flex; align-items: center; gap: 10px; padding: 13px 14px;
    background: none; border: none; border-bottom: 1px solid var(--border);
    cursor: pointer; text-align: left; width: 100%;
    -webkit-tap-highlight-color: transparent; transition: background 0.1s;
  }
  .suggestion-item:last-child { border-bottom: none; }
  .suggestion-item:active { background: #2a1e00; }
  [data-theme="light"] .suggestion-item:active { background: #fff8ec; }
  :global(.sug-icon) { color: var(--amber); flex-shrink: 0; }
  .sug-brand {
    flex: 1; font-family: var(--font-mono); font-size: 14px; font-weight: 700;
    color: var(--amber); text-transform: uppercase; letter-spacing: 0.04em;
  }
  .sug-hint { font-family: var(--font-mono); font-size: 10px; color: var(--text-lo); white-space: nowrap; }

  /* ── Panel de filtros ────────────────────────────────────────── */
  .filter-panel {
    background: var(--bg-card); border: 1.5px solid var(--border);
    border-radius: 10px; padding: 12px 14px;
    display: flex; flex-direction: column; gap: 12px;
    animation: slide-down 0.15s ease-out;
  }
  .filter-section { display: flex; flex-direction: column; gap: 7px; }
  .filter-section-label {
    font-family: var(--font-mono); font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-lo);
    display: flex; align-items: center; gap: 4px;
  }
  .filter-pills {
    display: flex; gap: 6px; flex-wrap: wrap;
  }
  .filter-pill {
    height: 30px; padding: 0 12px; border-radius: 15px;
    border: 1.5px solid var(--border); background: var(--bg-card);
    color: var(--text-mid); font-family: var(--font-ui); font-size: 13px;
    font-weight: 600; cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .filter-pill.active {
    border-color: var(--amber); color: var(--amber); background: #2a1e00;
  }
  [data-theme="light"] .filter-pill.active { background: #fff8ec; }

  .clear-filters-btn {
    display: flex; align-items: center; gap: 6px; align-self: flex-start;
    height: 28px; padding: 0 12px; border-radius: 14px;
    border: 1px solid var(--border-hi); background: none;
    color: var(--text-lo); font-family: var(--font-mono); font-size: 11px;
    font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  .clear-filters-btn:active { color: var(--red); border-color: var(--red); }

  /* ── Chips de filtros activos ─────────────────────────────────── */
  .active-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip {
    display: inline-flex; align-items: center; gap: 5px;
    height: 26px; padding: 0 8px;
    background: #2a1e00; border: 1px solid var(--amber-dim);
    border-radius: 13px; color: var(--amber);
    font-family: var(--font-mono); font-size: 11px; font-weight: 700;
  }
  [data-theme="light"] .chip { background: #fff8ec; }
  .chip-sector { color: #60a5fa; background: #0d1a2a; border-color: #1e3a5a; }
  [data-theme="light"] .chip-sector { background: #eff6ff; }
  .chip-remove {
    background: none; border: none; color: inherit; cursor: pointer;
    display: flex; align-items: center; padding: 0; opacity: 0.8;
    -webkit-tap-highlight-color: transparent;
  }

  /* ── Animaciones ─────────────────────────────────────────────── */
  @keyframes pop-in {
    from { transform: scale(0.85); opacity: 0; }
    to   { transform: scale(1);    opacity: 1; }
  }
  @keyframes slide-down {
    from { transform: translateY(-6px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
</style>
