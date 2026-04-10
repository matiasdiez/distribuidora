<script lang="ts">
  import { onMount } from 'svelte';
  import { searchProducts, getCategories } from '../lib/idb';
  import type { Product } from '../lib/supabase';

  // Props
  export let onResults: (products: Product[]) => void       = () => {};
  export let onCategoryChange: (cat: string) => void        = () => {};
  export let isLoading: boolean = false;

  let query        = '';
  let categories: string[] = [];
  let activeCategory = 'Todos';
  let debounceTimer: ReturnType<typeof setTimeout>;

  onMount(async () => {
    categories = await getCategories();
  });

  // Búsqueda con debounce liviano (150ms — suficiente para teléfono lento)
  async function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      isLoading = true;
      const cat = activeCategory === 'Todos' ? undefined : activeCategory;
      const results = await searchProducts(query, cat);
      onResults(results);
      isLoading = false;
    }, 150);
  }

  async function selectCategory(cat: string) {
    activeCategory = cat;
    onCategoryChange(cat);
    await handleInput();
  }

  function clearSearch() {
    query = '';
    handleInput();
  }
</script>

<div class="buscador">
  <!-- Input principal -->
  <div class="search-wrap">
    <span class="search-icon">⌕</span>
    <input
      class="input-field search-input"
      type="search"
      inputmode="search"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      placeholder="Buscar producto, marca o código..."
      bind:value={query}
      on:input={handleInput}
    />
    {#if query}
      <button class="clear-btn" on:click={clearSearch} aria-label="Limpiar búsqueda">✕</button>
    {/if}
  </div>

  <!-- Filtros de categoría -->
  {#if categories.length > 0}
    <div class="filters" role="group" aria-label="Filtrar por categoría">
      <button
        class="filter-pill"
        class:active={activeCategory === 'Todos'}
        on:click={() => selectCategory('Todos')}
      >
        Todos
      </button>
      {#each categories as cat}
        <button
          class="filter-pill"
          class:active={activeCategory === cat}
          on:click={() => selectCategory(cat)}
        >
          {cat}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .buscador {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .search-wrap {
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
    line-height: 1;
  }

  .search-input {
    padding-left: 40px;
    padding-right: 40px;
    font-size: 18px;
  }

  /* Remover UI nativa del input search en webkit */
  .search-input::-webkit-search-decoration,
  .search-input::-webkit-search-cancel-button { display: none; }

  .clear-btn {
    position: absolute;
    right: 0;
    width: var(--touch, 52px);
    height: var(--touch, 52px);
    background: none;
    border: none;
    color: var(--text-mid, #a0a0a0);
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  /* Filtros */
  .filters {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .filters::-webkit-scrollbar { display: none; }

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
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .filter-pill.active {
    border-color: var(--amber, #f5a623);
    color: var(--amber, #f5a623);
    background: #2a1e00;
  }

  .filter-pill:active { opacity: 0.7; }
</style>
