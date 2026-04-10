<script lang="ts">
  import { onMount } from 'svelte';
  import { searchProducts, getDepots, getStockByProduct } from '../lib/idb';
  import { initConnectivityListeners, initialSync } from '../lib/sync';
  import {
    loadThresholds, calcFreshness, worstStatus,
    type FreshnessThresholds, type FreshnessStatus
  } from '../lib/freshness';
  import { loadSavedDepot } from '../lib/depotStore';
  import { initTheme } from '../lib/themeStore';
  import SwipeCard     from './SwipeCard.svelte';
  import SyncStatus    from './SyncStatus.svelte';
  import FreshnessDot  from './FreshnessDot.svelte';
  import BottomNav     from './BottomNav.svelte';
  import SettingsSheet from './SettingsSheet.svelte';
  import type { Product, Depot } from '../lib/supabase';

  export let depotId: number = 1;

  let depots: Depot[]          = [];
  let currentDepot: Depot | null = null;   // depósito activo (se lee de localStorage en onMount)
  let showSettings             = false;

  // ── Estado general ────────────────────────────────────────────────────────
  let allProducts: Product[]  = [];
  let brands: string[]        = [];
  let categories: string[]    = [];
  let selectedBrand           = '';
  let selectedCategory        = 'Todos';
  let products: Product[]     = [];   // productos del brand/filtro activo
  let appReady                = false;
  let stockVersion            = 0;
  let thresholds: FreshnessThresholds | null = null;
  let brandFreshness: Record<string, FreshnessStatus> = {};

  // ── Swipe ─────────────────────────────────────────────────────────────────
  let currentIndex    = 0;
  let dragX           = 0;          // desplazamiento táctil actual
  let isDragging      = false;
  let startX          = 0;
  let isAnimating     = false;      // bloquear gestos durante animación
  let trackEl: HTMLElement;

  const SWIPE_THRESHOLD  = 70;     // px mínimos para confirmar swipe
  const SWIPE_MAX_ANGLE  = 30;     // grados máximos de inclinación horizontal

  onMount(() => {
    initTheme();

    const saved = loadSavedDepot();
    if (!saved) {
      window.location.replace('/');
      return () => {};
    }
    depotId      = saved.id;
    currentDepot = saved;

    const cleanup = initConnectivityListeners();
    (async () => {
      depots      = await getDepots();
      await initialSync();
      thresholds = await loadThresholds();
      allProducts = await searchProducts('');
      buildBrandsAndCategories();
      await computeBrandFreshness();
      appReady = true;
    })();
    return cleanup;
  });

  async function computeBrandFreshness() {
    if (!thresholds) return;
    const t   = thresholds;
    const map: Record<string, FreshnessStatus> = {};

    // Agrupar productos por marca
    const byBrand: Record<string, Product[]> = {};
    for (const p of allProducts) {
      if (!byBrand[p.brand]) byBrand[p.brand] = [];
      byBrand[p.brand].push(p);
    }

    for (const [brand, prods] of Object.entries(byBrand)) {
      const statuses: FreshnessStatus[] = await Promise.all(
        prods.map(async p => {
          const lots   = await getStockByProduct(p.id);
          const depot  = lots.filter(l => l.depot_id === depotId);
          const latest = depot.length > 0
            ? depot.map(l => new Date(l.created_at)).sort((a, b) => b.getTime() - a.getTime())[0]
            : null;
          return calcFreshness(latest, t).status as FreshnessStatus;
        })
      );
      map[brand] = worstStatus(statuses);
    }
    brandFreshness = map;
  }  function buildBrandsAndCategories() {
    // Categorías únicas
    categories = ['Todos', ...new Set(allProducts.map(p => p.category))].sort();
    // Marcas únicas (filtradas por categoría activa)
    rebuildBrands();
  }

  function rebuildBrands() {
    const source = selectedCategory === 'Todos'
      ? allProducts
      : allProducts.filter(p => p.category === selectedCategory);
    brands = [...new Set(source.map(p => p.brand))].sort();
  }

  function selectCategory(cat: string) {
    selectedCategory = cat;
    selectedBrand    = '';
    products         = [];
    currentIndex     = 0;
    rebuildBrands();
  }

  function selectBrand(brand: string) {
    selectedBrand = brand;
    currentIndex  = 0;
    dragX         = 0;
    const source  = selectedCategory === 'Todos'
      ? allProducts
      : allProducts.filter(p => p.category === selectedCategory);
    products = source.filter(p => p.brand === brand);
  }

  function clearBrand() {
    selectedBrand = '';
    products      = [];
    currentIndex  = 0;
  }

  // ── Navegación por botones ────────────────────────────────────────────────
  function goNext() {
    if (currentIndex < products.length - 1 && !isAnimating) {
      animateTo(currentIndex + 1, 'left');
    }
  }

  function goPrev() {
    if (currentIndex > 0 && !isAnimating) {
      animateTo(currentIndex - 1, 'right');
    }
  }

  function animateTo(targetIndex: number, direction: 'left' | 'right') {
    isAnimating = true;
    // Animar la salida de la card actual
    dragX = direction === 'left' ? -window.innerWidth : window.innerWidth;
    setTimeout(() => {
      currentIndex = targetIndex;
      dragX        = 0;
      isAnimating  = false;
    }, 280);
  }

  // ── Gestos táctiles ───────────────────────────────────────────────────────
  function onTouchStart(e: TouchEvent) {
    if (isAnimating || products.length === 0) return;
    startX     = e.touches[0].clientX;
    isDragging = true;
  }

  function onTouchMove(e: TouchEvent) {
    if (!isDragging || isAnimating) return;
    const deltaX = e.touches[0].clientX - startX;
    const deltaY = Math.abs(e.touches[0].clientY - (e.touches[0].clientY)); // no usamos Y
    // Solo horizontal
    dragX = deltaX;
    // Bloquear scroll vertical solo si es gesto horizontal claro
    if (Math.abs(deltaX) > 10) {
      e.preventDefault();
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (!isDragging) return;
    isDragging = false;
    const delta = dragX;

    if (delta < -SWIPE_THRESHOLD && currentIndex < products.length - 1) {
      animateTo(currentIndex + 1, 'left');
    } else if (delta > SWIPE_THRESHOLD && currentIndex > 0) {
      animateTo(currentIndex - 1, 'right');
    } else {
      // Volver al centro
      isAnimating = true;
      dragX = 0;
      setTimeout(() => { isAnimating = false; }, 250);
    }
  }

  // ── Teclado (desktop) ─────────────────────────────────────────────────────
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft')  goPrev();
    if (e.key === 'ArrowRight') goNext();
  }

  // ── Cálculo de transforms para las cards ─────────────────────────────────
  // IMPORTANTE: usar $: para que Svelte rastree currentIndex, dragX e isDragging
  // como dependencias reactivas. Una función ordinaria no funciona porque Svelte
  // no puede ver las dependencias dentro del cuerpo de la función.
  $: cardStyles = products.map((_, i) => {
    const offset      = i - currentIndex;
    const trackWidth  = trackEl?.offsetWidth || 320;
    const x           = offset * 100 + (dragX / trackWidth) * 100;
    const rotate      = offset === 0 ? (dragX / 30) : (offset * 2);
    const scale       = offset === 0 ? 1 : 0.94;
    const zIndex      = offset === 0 ? 10 : 5 - Math.abs(offset);
    const opacity     = Math.abs(offset) > 1 ? 0 : 1;
    const transition  = isDragging
      ? 'none'
      : 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.28s';

    return [
      `transform: translateX(${x}%) rotate(${rotate}deg) scale(${scale})`,
      `z-index: ${zIndex}`,
      `opacity: ${opacity}`,
      `transition: ${transition}`,
    ].join(';');
  });

  function handleStockSaved() {
    stockVersion++;
  }

  // Keyboard navigation cuando hay una marca seleccionada
  $: hasProducts = products.length > 0;
</script>

<svelte:window on:keydown={onKeyDown} />

<div class="swipe-app">

  <!-- Header compacto -->
  <header class="app-header">
    <div class="header-left">
      {#if selectedBrand}
        <button class="back-btn" on:click={clearBrand} aria-label="Volver">←</button>
        <span class="header-brand">{selectedBrand}</span>
      {:else}
        <div class="header-brand-context">
          <span class="brand-icon">⬡</span>
          <div class="brand-text">
            <span class="brand-title">SWIPE</span>
          </div>
        </div>
      {/if}
    </div>
    <SyncStatus />
  </header>

  {#if !appReady}
    <div class="splash">
      <span class="spin">⟳</span>
      <p>Cargando productos...</p>
    </div>

  {:else if !selectedBrand}
    <!-- ── Selector de marca ─────────────────────────────────────────────── -->
    <div class="selector-wrap">

      <!-- Filtro de categoría -->
      <div class="cat-pills">
        {#each categories as cat}
          <button
            class="cat-pill"
            class:active={selectedCategory === cat}
            on:click={() => selectCategory(cat)}
          >{cat}</button>
        {/each}
      </div>

      <p class="selector-label">
        {brands.length} marca{brands.length !== 1 ? 's' : ''}
        {selectedCategory !== 'Todos' ? `en ${selectedCategory}` : ''}
        — tocá una para hacer swipe
      </p>

      <!-- Grid de marcas -->
      <div class="brands-grid">
        {#each brands as brand}
          {@const count = allProducts.filter(p =>
            p.brand === brand &&
            (selectedCategory === 'Todos' || p.category === selectedCategory)
          ).length}
          <button
            class="brand-btn"
            on:click={() => selectBrand(brand)}
          >
            <span class="brand-name">{brand}</span>
            <div class="brand-right">
              {#if brandFreshness[brand]}
                <FreshnessDot status={brandFreshness[brand]} size="sm" />
              {/if}
              <span class="brand-count">{count}</span>
            </div>
          </button>
        {/each}
      </div>
    </div>

  {:else}
    <!-- ── Vista swipe ───────────────────────────────────────────────────── -->
    <div class="swipe-wrap">

      <!-- Barra de progreso -->
      <div class="progress-bar">
        <div
          class="progress-fill"
          style="width: {((currentIndex + 1) / products.length) * 100}%"
        ></div>
      </div>

      <!-- Track de cards -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="track"
        bind:this={trackEl}
        on:touchstart={onTouchStart}
        on:touchmove={onTouchMove}
        on:touchend={onTouchEnd}
      >
        {#each products as product, i (product.id)}
          <div class="card-slot" style={cardStyles[i]}>
            {#key stockVersion + '-' + product.id}
              <SwipeCard
                {product}
                depotId={depotId}
                index={i}
                total={products.length}
                on:saved={handleStockSaved}
              />
            {/key}
          </div>
        {/each}
      </div>

      <!-- Botones de navegación (para desktop y como fallback táctil) -->
      <div class="nav-btns">
        <button
          class="nav-btn"
          class:disabled={currentIndex === 0}
          on:click={goPrev}
          disabled={currentIndex === 0 || isAnimating}
          aria-label="Producto anterior"
        >←</button>

        <span class="nav-dots">
          {#each products as _, i}
            <button
              class="dot"
              class:active={i === currentIndex}
              on:click={() => !isAnimating && animateTo(i, i > currentIndex ? 'left' : 'right')}
              aria-label="Ir al producto {i + 1}"
            ></button>
          {/each}
        </span>

        <button
          class="nav-btn"
          class:disabled={currentIndex === products.length - 1}
          on:click={goNext}
          disabled={currentIndex === products.length - 1 || isAnimating}
          aria-label="Producto siguiente"
        >→</button>
      </div>

    </div>
  {/if}
</div>

<!-- Navegación inferior (fuera del swipe-app para que sea fixed) -->
<BottomNav activePage="swipe" on:settings={() => showSettings = true} />

<SettingsSheet
  open={showSettings}
  products={[]}
  {depotId}
  categoryLabel="Todos"
  {depots}
  activeDepot={currentDepot}
  on:close={() => showSettings = false}
  on:depotSelected={() => { showSettings = false; }}
/>

<style>
  .swipe-app {
    min-height: 100dvh;
    background: var(--bg, #0d0d0d);
    color: var(--text-hi, #f0f0f0);
    font-family: var(--font-ui, sans-serif);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* Espacio para el bottom nav */
    padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  }

  /* Header */
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border, #2a2a2a);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  /* Nuevo header brand context (reemplaza .app-logo y .home-link) */
  .header-brand-context {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .brand-icon {
    font-size: 18px;
    color: var(--amber, #f5a623);
  }

  .brand-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .brand-title {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: var(--amber, #f5a623);
    letter-spacing: 0.15em;
    line-height: 1;
  }

  .back-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid var(--border, #2a2a2a);
    background: var(--bg-card, #1a1a1a);
    color: var(--text-hi, #f0f0f0);
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
  }

  .header-brand {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    color: var(--amber, #f5a623);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    letter-spacing: 0.05em;
  }

  .spin {
    font-size: 30px;
    color: var(--amber, #f5a623);
    animation: spin 1.2s linear infinite;
    display: inline-block;
  }

  /* ── Selector ── */
  .selector-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
  }

  .cat-pills {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 12px 12px 0;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .cat-pills::-webkit-scrollbar { display: none; }

  .cat-pill {
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
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }

  .cat-pill.active {
    border-color: var(--amber, #f5a623);
    color: var(--amber, #f5a623);
    background: #2a1e00;
  }

  .selector-label {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-lo, #555);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    padding: 10px 14px 6px;
    flex-shrink: 0;
  }

  .brands-grid {
    flex: 1;
    overflow-y: auto;
    padding: 0 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .brand-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 52px;
    padding: 12px 16px;
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 8px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, background 0.15s;
    text-align: left;
  }

  .brand-btn:active {
    border-color: var(--amber, #f5a623);
    background: #1a1200;
  }

  .brand-name {
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: var(--text-hi, #f0f0f0);
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .brand-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .brand-count {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--text-lo, #555);
    background: var(--bg, #0d0d0d);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 4px;
    padding: 2px 7px;
    flex-shrink: 0;
  }

  /* ── Swipe view ── */
  .swipe-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 10px 0 0;
  }

  /* Barra de progreso */
  .progress-bar {
    height: 2px;
    background: var(--border, #2a2a2a);
    margin: 0 16px 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .progress-fill {
    height: 100%;
    background: var(--amber, #f5a623);
    border-radius: 2px;
    transition: width 0.28s ease;
  }

  /* Track de cards */
  .track {
    flex: 1;
    position: relative;
    overflow: hidden;
    touch-action: pan-y;   /* permitir scroll vertical, capturamos horizontal nosotros */
  }

  .card-slot {
    position: absolute;
    inset: 0 16px;           /* margen lateral para ver los lados */
    transform-origin: center bottom;
    will-change: transform;
  }

  /* Botones de navegación */
  .nav-btns {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px 20px;
    flex-shrink: 0;
    gap: 12px;
  }

  .nav-btn {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 1.5px solid var(--border-hi, #3a3a3a);
    background: var(--bg-card, #1a1a1a);
    color: var(--text-hi, #f0f0f0);
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
    transition: opacity 0.15s, border-color 0.15s;
    flex-shrink: 0;
  }

  .nav-btn.disabled,
  .nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .nav-btn:not(.disabled):active {
    border-color: var(--amber, #f5a623);
    color: var(--amber, #f5a623);
  }

  /* Dots */
  .nav-dots {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    justify-content: center;
    flex-wrap: wrap;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: none;
    background: var(--border-hi, #3a3a3a);
    cursor: pointer;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.2s, transform 0.2s;
  }

  .dot.active {
    background: var(--amber, #f5a623);
    transform: scale(1.3);
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
</style>
