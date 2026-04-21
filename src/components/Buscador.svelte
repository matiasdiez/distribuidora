<script lang="ts">
  import { onMount } from "svelte";
  import { Search, X, Tag } from 'lucide-svelte';
  import { searchProducts, getCategoriesLocal, getBrands } from "../lib/idb";
  import type { Product } from "../lib/supabase";

  export let onResults: (products: Product[]) => void = () => {};
  export let onCategoryChange: (cat: string) => void = () => {};
  export let isLoading: boolean = false;
  export let depotId: number | "unassigned" | undefined = 1;
  export let query = "";

  let categories: string[]  = [];
  let allBrands: string[]   = [];
  let activeCategory        = "Todos";
  let debounceTimer: ReturnType<typeof setTimeout>;

  // ── Marca fija ────────────────────────────────────────────────
  // Cuando el usuario elige una marca del autocomplete, queda como
  // "tag" fijo en el campo. El query libre se suma encima.
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
      suggestions    = [];
      showSuggestions = false;
    }
  }

  onMount(async () => {
    [categories, allBrands] = await Promise.all([getCategoriesLocal(), getBrands()]);
    // Trigger búsqueda inicial (mostrar todo)
    await runSearch();
  });

  async function runSearch() {
    isLoading = true;
    const cat = activeCategory === "Todos" ? undefined : activeCategory;
    const results = await searchProducts(effectiveQuery, cat, depotId);
    onResults(results);
    isLoading = false;
  }

  function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 150);
  }

  function pinBrand(brand: string) {
    pinnedBrand     = brand;
    query           = "";
    showSuggestions = false;
    // Foco de vuelta al input para seguir escribiendo
    setTimeout(() => inputEl?.focus(), 30);
    runSearch();
  }

  function unpinBrand() {
    pinnedBrand = null;
    query       = "";
    runSearch();
  }

  function clearFreeQuery() {
    query = "";
    runSearch();
  }

  function clearAll() {
    pinnedBrand = null;
    query       = "";
    runSearch();
  }

  function handleBlur() {
    // Pequeño delay para que el click en sugerencia se procese antes de ocultar
    setTimeout(() => { showSuggestions = false; }, 150);
  }

  async function selectCategory(cat: string) {
    activeCategory = cat;
    onCategoryChange(cat);
    await runSearch();
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="buscador">

  <!-- ── Campo de búsqueda ───────────────────────────────────── -->
  <div class="search-wrap" class:has-pin={!!pinnedBrand}>

    <!-- Ícono lupa (izquierda) -->
    {#if !pinnedBrand}
      <span class="search-icon"><Search size={20} strokeWidth={2} /></span>
    {/if}

    <!-- Tag de marca fija -->
    {#if pinnedBrand}
      <div class="brand-pin">
        <Tag size={11} strokeWidth={2.5} />
        <span class="pin-label">{pinnedBrand}</span>
        <button class="pin-remove" on:click={unpinBrand} aria-label="Quitar marca fija">
          <X size={11} strokeWidth={3} />
        </button>
      </div>
    {/if}

    <!-- Input libre -->
    <input
      bind:this={inputEl}
      class="input-field search-input"
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

    <!-- Botón limpiar -->
    {#if query || pinnedBrand}
      <button
        class="clear-btn"
        on:click={clearAll}
        aria-label="Limpiar búsqueda"
      >
        <X size={16} strokeWidth={2.5} />
      </button>
    {/if}
  </div>

  <!-- ── Sugerencias de marcas ───────────────────────────────── -->
  {#if showSuggestions}
    <div class="suggestions" role="listbox" aria-label="Marcas sugeridas">
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

  <!-- ── Filtros de categoría ────────────────────────────────── -->
  {#if categories.length > 0}
    <div class="filters" role="group" aria-label="Filtrar por categoría">
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
  {/if}

</div>

<style>
  .buscador { display: flex; flex-direction: column; gap: 10px; }

  /* ── Campo ─────────────────────────────────────────────────── */
  .search-wrap {
    position: relative;
    display: flex;
    align-items: center;
    background: var(--bg-card, #1a1a1a);
    border: 1.5px solid var(--border, #2a2a2a);
    border-radius: var(--radius, 8px);
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .search-wrap:focus-within { border-color: var(--amber, #f5a623); }
  .search-wrap.has-pin      { border-color: var(--amber-dim, #b57a1a); }

  .search-icon {
    position: absolute; left: 13px;
    color: var(--text-lo, #555);
    pointer-events: none;
    display: flex; align-items: center;
  }

  /* El input ocupa todo el ancho; el padding-left cambia si hay tag */
  .search-input {
    flex: 1; min-width: 0;
    height: var(--touch, 52px);
    padding: 0 48px 0 42px;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-hi, #f0f0f0);
    font-family: var(--font-ui, sans-serif);
    font-size: 18px;
  }
  .search-input.with-pin {
    padding-left: 10px;
    font-size: 16px;
  }
  .search-input::placeholder { color: var(--text-lo, #555); }
  .search-input::-webkit-search-decoration,
  .search-input::-webkit-search-cancel-button { display: none; }

  .clear-btn {
    position: absolute; right: 0;
    width: var(--touch, 52px); height: var(--touch, 52px);
    background: none; border: none;
    color: var(--text-mid, #a0a0a0);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  /* ── Tag de marca fija ─────────────────────────────────────── */
  .brand-pin {
    display: flex; align-items: center; gap: 5px;
    margin-left: 10px;
    padding: 5px 4px 5px 8px;
    background: #2a1e00;
    border: 1.5px solid var(--amber, #f5a623);
    border-radius: 20px;
    flex-shrink: 0;
    max-width: 52%;
    animation: pop-in 0.15s ease-out;
  }
  .pin-label {
    font-family: var(--font-mono, monospace);
    font-size: 12px; font-weight: 700;
    color: var(--amber, #f5a623);
    text-transform: uppercase; letter-spacing: 0.04em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .pin-remove {
    width: 20px; height: 20px; border-radius: 50%;
    border: none; background: #3a2800;
    color: var(--amber, #f5a623);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
    padding: 0;
  }
  .pin-remove:active { background: #4a3400; }

  /* ── Sugerencias ───────────────────────────────────────────── */
  .suggestions {
    display: flex; flex-direction: column;
    background: var(--bg-card, #1a1a1a);
    border: 1.5px solid var(--amber, #f5a623);
    border-radius: 8px;
    overflow: hidden;
    animation: slide-down 0.12s ease-out;
  }
  .suggestion-item {
    display: flex; align-items: center; gap: 10px;
    padding: 13px 14px;
    background: none; border: none; border-bottom: 1px solid var(--border, #2a2a2a);
    cursor: pointer; text-align: left; width: 100%;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.1s;
  }
  .suggestion-item:last-child { border-bottom: none; }
  .suggestion-item:active { background: #2a1e00; }
  :global(.sug-icon) { color: var(--amber, #f5a623); flex-shrink: 0; }
  .sug-brand {
    flex: 1;
    font-family: var(--font-mono, monospace);
    font-size: 14px; font-weight: 700;
    color: var(--amber, #f5a623);
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .sug-hint {
    font-family: var(--font-mono, monospace);
    font-size: 10px; color: var(--text-lo, #555);
    white-space: nowrap;
  }

  /* ── Filtros de categoría ──────────────────────────────────── */
  .filters {
    display: flex; gap: 6px;
    overflow-x: auto; padding-bottom: 2px;
    scrollbar-width: none;
  }
  .filters::-webkit-scrollbar { display: none; }

  .filter-pill {
    flex-shrink: 0; height: 34px; padding: 0 14px; border-radius: 20px;
    border: 1.5px solid var(--border, #2a2a2a); background: var(--bg-card, #1a1a1a);
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-ui, sans-serif); font-size: 14px; font-weight: 600;
    letter-spacing: 0.02em; cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .filter-pill.active {
    border-color: var(--amber, #f5a623);
    color: var(--amber, #f5a623);
    background: #2a1e00;
  }
  .filter-pill:active { opacity: 0.7; }

  /* ── Animaciones ───────────────────────────────────────────── */
  @keyframes pop-in {
    from { transform: scale(0.85); opacity: 0; }
    to   { transform: scale(1);    opacity: 1; }
  }
  @keyframes slide-down {
    from { transform: translateY(-6px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
</style>
