<script lang="ts">
  import { onMount } from "svelte";
  import { searchProducts, getDepots, getStockByProduct } from "../lib/idb";
  import { initConnectivityListeners, initialSync } from "../lib/sync";
  import {
    loadThresholds,
    calcFreshness,
    worstStatus,
    type FreshnessThresholds,
    type FreshnessStatus,
  } from "../lib/freshness";
  import { loadSavedDepot } from "../lib/depotStore";
  import { initTheme } from "../lib/themeStore";
  import {
    Hexagon,
    ArrowLeft,
    ArrowRight,
    Search,
    X,
    Loader2,
  } from "lucide-svelte";
  import SwipeCard from "./SwipeCard.svelte";
  import SyncStatus from "./SyncStatus.svelte";
  import FreshnessDot from "./FreshnessDot.svelte";
  import BottomNav from "./BottomNav.svelte";
  import SettingsSheet from "./SettingsSheet.svelte";
  import type { Product, Depot } from "../lib/supabase";
  import type { SubDepot } from "../lib/idb";

  export let depotId: number = 1;

  let depots: Depot[] = [];
  let currentDepot: Depot | null = null; // depósito activo (se lee de localStorage en onMount)
  let showSettings = false;

  // ── Estado general ────────────────────────────────────────────────────────
  let allProducts: Product[] = [];
  let brands: string[] = [];
  let categories: string[] = [];
  let selectedBrand = "";
  let catalogMode = false; // true = no filtrar por depósito
  let selectedCategory = "Todos";
  let products: Product[] = []; // productos del brand/filtro activo
  let appReady = false;
  let stockVersion = 0;
  let thresholds: FreshnessThresholds | null = null;
  let brandFreshness: Record<string, FreshnessStatus> = {};

  // ── Swipe ─────────────────────────────────────────────────────────────────
  let currentIndex = 0;
  let dragX = 0; // desplazamiento táctil actual
  let isDragging = false;
  let startX = 0;
  let isAnimating = false; // bloquear gestos durante animación
  let trackEl: HTMLElement;

  const SWIPE_THRESHOLD = 70; // px mínimos para confirmar swipe
  const SWIPE_MAX_ANGLE = 30; // grados máximos de inclinación horizontal

  onMount(() => {
    initTheme();

    const saved = loadSavedDepot();
    if (!saved) {
      window.location.replace("/");
      return () => {};
    }
    depotId = saved.id;
    currentDepot = saved;

    const cleanup = initConnectivityListeners();
    (async () => {
      depots = await getDepots();
      await initialSync();
      thresholds = await loadThresholds();
      allProducts = await searchProducts(""); // todos los productos
      buildBrandsAndCategories();
      await computeBrandFreshness();
      appReady = true;
    })();
    return cleanup;
  });

  async function computeBrandFreshness() {
    if (!thresholds) return;
    const t = thresholds;
    const map: Record<string, FreshnessStatus> = {};

    // Agrupar productos por marca
    const byBrand: Record<string, Product[]> = {};
    for (const p of allProducts) {
      if (!byBrand[p.brand]) byBrand[p.brand] = [];
      byBrand[p.brand].push(p);
    }

    for (const [brand, prods] of Object.entries(byBrand)) {
      const statuses: FreshnessStatus[] = await Promise.all(
        prods.map(async (p) => {
          const lots = await getStockByProduct(p.id);
          const depot = lots.filter((l) => l.depot_id === depotId);
          const latest =
            depot.length > 0
              ? depot
                  .map((l) => new Date(l.created_at))
                  .sort((a, b) => b.getTime() - a.getTime())[0]
              : null;
          return calcFreshness(latest, t).status as FreshnessStatus;
        }),
      );
      map[brand] = worstStatus(statuses);
    }
    brandFreshness = map;
  }
  function buildBrandsAndCategories() {
    // Categorías únicas
    categories = [
      "Todos",
      ...new Set(allProducts.map((p) => p.category)),
    ].sort();
    // Marcas únicas (filtradas por categoría activa)
    rebuildBrands();
  }

  let brandSearch = "";
  let subDepots: SubDepot[] = [];
  let activeSubDepotId: number | null | undefined = undefined;

  function rebuildBrands() {
    const catSource =
      selectedCategory === "Todos"
        ? allProducts
        : allProducts.filter((p) => p.category === selectedCategory);
    const source = catalogMode
      ? catSource
      : catSource.filter((p) => p.depot_id === depotId);
    brands = [...new Set(source.map((p) => p.brand))].sort();
  }

  $: filteredBrands = brandSearch.trim()
    ? brands.filter((b) =>
        b.toLowerCase().includes(brandSearch.toLowerCase().trim()),
      )
    : brands;

  function selectCategory(cat: string) {
    selectedCategory = cat;
    selectedBrand = "";
    brandSearch = "";
    products = [];
    currentIndex = 0;
    rebuildBrands();
  }

  $: {
    catalogMode;
    rebuildBrands();
  } // recompute brands when mode changes

  function selectBrand(brand: string) {
    selectedBrand = brand;
    currentIndex = 0;
    dragX = 0;
    activeSubDepotId = undefined;
    subDepots = []; // reset while loading

    // Mostrar productos INMEDIATAMENTE, sin esperar sub-depósitos
    applyProductFilter();

    // Cargar sub-depósitos en background (no bloquea la vista)
    if (!catalogMode) {
      getSubDepots(depotId).then((sds) => {
        subDepots = sds;
      });
    }
  }

  function applyProductFilter() {
    const source =
      selectedCategory === "Todos"
        ? allProducts
        : allProducts.filter((p) => p.category === selectedCategory);
    const byDepot = catalogMode
      ? source
      : source.filter((p) => p.depot_id === depotId);
    const byBrand = byDepot.filter((p) => p.brand === selectedBrand);
    products =
      activeSubDepotId === undefined
        ? byBrand
        : byBrand.filter((p) =>
            activeSubDepotId === null
              ? (p as any).sub_depot_id == null
              : (p as any).sub_depot_id === activeSubDepotId,
          );
    currentIndex = 0;
  }

  function toggleCatalog() {
    catalogMode = !catalogMode;
    selectedBrand = "";
    products = [];
    currentIndex = 0;
    rebuildBrands();
  }

  function clearBrand() {
    selectedBrand = "";
    products = [];
    currentIndex = 0;
  }

  // ── Navegación por botones ────────────────────────────────────────────────
  function goNext() {
    if (currentIndex < products.length - 1 && !isAnimating) {
      animateTo(currentIndex + 1, "left");
    }
  }

  function goPrev() {
    if (currentIndex > 0 && !isAnimating) {
      animateTo(currentIndex - 1, "right");
    }
  }

  function animateTo(targetIndex: number, direction: "left" | "right") {
    isAnimating = true;
    // Animar la salida de la card actual
    dragX = direction === "left" ? -window.innerWidth : window.innerWidth;
    setTimeout(() => {
      currentIndex = targetIndex;
      dragX = 0;
      isAnimating = false;
    }, 280);
  }

  // ── Gestos táctiles ───────────────────────────────────────────────────────
  function onTouchStart(e: TouchEvent) {
    if (isAnimating || products.length === 0) return;
    startX = e.touches[0].clientX;
    isDragging = true;
  }

  function onTouchMove(e: TouchEvent) {
    if (!isDragging || isAnimating) return;
    const deltaX = e.touches[0].clientX - startX;
    const deltaY = Math.abs(e.touches[0].clientY - e.touches[0].clientY); // no usamos Y
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
      animateTo(currentIndex + 1, "left");
    } else if (delta > SWIPE_THRESHOLD && currentIndex > 0) {
      animateTo(currentIndex - 1, "right");
    } else {
      // Volver al centro
      isAnimating = true;
      dragX = 0;
      setTimeout(() => {
        isAnimating = false;
      }, 250);
    }
  }

  // ── Teclado (desktop) ─────────────────────────────────────────────────────
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") goPrev();
    if (e.key === "ArrowRight") goNext();
  }

  // ── Cálculo de transforms para las cards ─────────────────────────────────
  // IMPORTANTE: usar $: para que Svelte rastree currentIndex, dragX e isDragging
  // como dependencias reactivas. Una función ordinaria no funciona porque Svelte
  // no puede ver las dependencias dentro del cuerpo de la función.
  $: cardStyles = products.map((_, i) => {
    const offset = i - currentIndex;
    const trackWidth = trackEl?.offsetWidth || 320;
    const x = offset * 100 + (dragX / trackWidth) * 100;
    const rotate = offset === 0 ? dragX / 30 : offset * 2;
    const scale = offset === 0 ? 1 : 0.94;
    const zIndex = offset === 0 ? 10 : 5 - Math.abs(offset);
    const opacity = Math.abs(offset) > 1 ? 0 : 1;
    const transition = isDragging
      ? "none"
      : "transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.28s";

    return [
      `transform: translateX(${x}%) rotate(${rotate}deg) scale(${scale})`,
      `z-index: ${zIndex}`,
      `opacity: ${opacity}`,
      `transition: ${transition}`,
    ].join(";");
  });

  function handleStockSaved() {
    stockVersion++;
  }

  // Keyboard navigation cuando hay una marca seleccionada
  $: hasProducts = products.length > 0;

  // ── Carousel indicators estilo Instagram ─────────────────────────────────
  const MAX_DOTS = 5;
  $: visibleDots = (() => {
    const n = products.length;
    if (n === 0) return [];

    if (n <= MAX_DOTS) {
      return Array.from({ length: n }, (_, i) => ({
        realIndex: i,
        active: i === currentIndex,
        size: i === currentIndex ? 7 : 5.5,
        opacity: 1,
      }));
    }

    const half = Math.floor(MAX_DOTS / 2);
    const start = Math.max(0, Math.min(currentIndex - half, n - MAX_DOTS));
    const end = start + MAX_DOTS - 1;

    return Array.from({ length: MAX_DOTS }, (_, j) => {
      const idx = start + j;
      const isActive = idx === currentIndex;
      const isLeftEdge = j === 0 && start > 0;
      const isRightEdge = j === MAX_DOTS - 1 && end < n - 1;
      const isEdge = isLeftEdge || isRightEdge;

      return {
        realIndex: idx,
        active: isActive,
        size: isActive ? 7 : isEdge ? 3.5 : 5.5,
        opacity: isActive ? 1 : isEdge ? 0.25 : 0.5,
      };
    });
  })();
</script>

<svelte:window on:keydown={onKeyDown} />

<div class="swipe-app">
  <!-- Header compacto -->
  <header class="app-header">
    <div class="header-left">
      {#if selectedBrand}
        <button class="back-btn" on:click={clearBrand} aria-label="Volver"
          ><ArrowLeft size={18} strokeWidth={2} /></button
        >
        <span class="header-brand">{selectedBrand}</span>
      {:else}
        <div class="header-brand-context">
          <span class="brand-icon"><Hexagon size={18} strokeWidth={2} /></span>
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
      <Loader2 size={28} strokeWidth={1.5} class="spin" />
      <p>Cargando productos...</p>
    </div>
  {:else if !selectedBrand}
    <!-- ── Selector de marca ─────────────────────────────────────────────── -->
    <div class="selector-wrap">
      <!-- Campo de búsqueda -->
      <div class="brand-search-wrap">
        <span class="search-icon"><Search size={16} strokeWidth={2} /></span>
        <input
          class="brand-search"
          type="search"
          placeholder="Buscar marca..."
          bind:value={brandSearch}
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
        />
        {#if brandSearch}
          <button
            class="search-clear"
            on:click={() => (brandSearch = "")}
            aria-label="Limpiar búsqueda"
            ><X size={12} strokeWidth={2.5} /></button
          >
        {/if}
      </div>

      <!-- Scope: mi depósito / todo el catálogo -->
      <div class="scope-pills">
        <button
          class="scope-pill"
          class:active={!catalogMode}
          on:click={() => {
            if (catalogMode) toggleCatalog();
          }}>Mi depósito</button
        >
        <button
          class="scope-pill"
          class:active={catalogMode}
          on:click={() => {
            if (!catalogMode) toggleCatalog();
          }}>Todo el catálogo</button
        >
      </div>

      <!-- Filtro de categoría: "Todos" fijo + resto scrolleable -->
      <div class="cat-pills-wrap cat-pills">
        <button
          class="cat-pill cat-pill-all"
          class:active={selectedCategory === "Todos"}
          on:click={() => selectCategory("Todos")}>Todos</button
        >
        <div class="cat-pills-scroll">
          {#each categories.filter((c) => c !== "Todos") as cat}
            <button
              class="cat-pill"
              class:active={selectedCategory === cat}
              on:click={() => selectCategory(cat)}>{cat}</button
            >
          {/each}
        </div>
      </div>

      <p class="selector-label">
        {#if brandSearch.trim() && filteredBrands.length !== brands.length}
          {filteredBrands.length} de {brands.length} marca{brands.length !== 1
            ? "s"
            : ""}
          {selectedCategory !== "Todos" ? `en ${selectedCategory}` : ""}
        {:else}
          {brands.length} marca{brands.length !== 1 ? "s" : ""}
          {selectedCategory !== "Todos" ? `en ${selectedCategory}` : ""}
        {/if}
        — tocá una para hacer swipe
      </p>

      <!-- Grid de marcas -->
      <div class="brands-grid">
        {#each filteredBrands as brand}
          {@const count = allProducts.filter(
            (p) =>
              p.brand === brand &&
              (selectedCategory === "Todos" || p.category === selectedCategory),
          ).length}
          <button class="brand-btn" on:click={() => selectBrand(brand)}>
            <span class="brand-name">{brand}</span>
            <div class="brand-right">
              {#if brandFreshness[brand]}
                <FreshnessDot status={brandFreshness[brand]} size="sm" />
              {/if}
              <span class="brand-count">{count}</span>
            </div>
          </button>
        {/each}

        {#if filteredBrands.length === 0}
          <p class="no-results">Sin resultados para "{brandSearch}"</p>
        {/if}
      </div>
    </div>
  {:else}
    <!-- ── Vista swipe ───────────────────────────────────────────────────── -->
    <div class="swipe-wrap">
      <!-- Filtro sub-depósito (solo si el depósito tiene sectores) -->
      {#if subDepots.length > 0}
        <div class="sd-filter-bar">
          <span class="sd-filter-label"
            ><Layers size={11} strokeWidth={2} /> Sector</span
          >
          <button
            class="sd-pill"
            class:active={activeSubDepotId === undefined}
            on:click={() => {
              activeSubDepotId = undefined;
              applyProductFilter();
            }}>Todos</button
          >
          <button
            class="sd-pill"
            class:active={activeSubDepotId === null}
            on:click={() => {
              activeSubDepotId = null;
              applyProductFilter();
            }}>Sin sector</button
          >
          {#each subDepots as sd}
            <button
              class="sd-pill"
              class:active={activeSubDepotId === sd.id}
              on:click={() => {
                activeSubDepotId = sd.id;
                applyProductFilter();
              }}>{sd.name}</button
            >
          {/each}
        </div>
      {/if}

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
            {#key stockVersion + "-" + product.id}
              <SwipeCard
                {product}
                {depotId}
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
          ><ArrowLeft size={20} strokeWidth={2} /></button
        >

        <span
          class="nav-dots"
          aria-label="Producto {currentIndex + 1} de {products.length}"
        >
          {#each visibleDots as dot, j (j)}
            <button
              class="dot"
              class:active={dot.active}
              style="--dot-size:{dot.size}px; --dot-opacity:{dot.opacity}"
              on:click={() =>
                !isAnimating &&
                animateTo(
                  dot.realIndex,
                  dot.realIndex > currentIndex ? "left" : "right",
                )}
              aria-label="Ir al producto {dot.realIndex +
                1} de {products.length}"
            ></button>
          {/each}
        </span>

        <button
          class="nav-btn"
          class:disabled={currentIndex === products.length - 1}
          on:click={goNext}
          disabled={currentIndex === products.length - 1 || isAnimating}
          aria-label="Producto siguiente"
          ><ArrowRight size={20} strokeWidth={2} /></button
        >
      </div>
    </div>
  {/if}
</div>

<!-- Navegación inferior (fuera del swipe-app para que sea fixed) -->
<BottomNav activePage="swipe" on:settings={() => (showSettings = true)} />

<SettingsSheet
  open={showSettings}
  products={[]}
  {depotId}
  categoryLabel="Todos"
  {depots}
  activeDepot={currentDepot}
  on:close={() => (showSettings = false)}
  on:depotSelected={() => {
    showSettings = false;
  }}
/>

<style>
  .swipe-app {
    height: 100dvh;
    max-height: 100dvh;
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

  /* ── Búsqueda de marca ── */
  .brand-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
    margin: 12px 12px 0;
    flex-shrink: 0;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    font-size: 17px;
    color: var(--text-lo, #555);
    pointer-events: none;
    line-height: 1;
    top: 50%;
    transform: translateY(-50%);
  }

  .brand-search {
    width: 100%;
    height: 40px;
    padding: 0 36px 0 36px;
    background: var(--bg-card, #1a1a1a);
    border: 1.5px solid var(--border, #2a2a2a);
    border-radius: 10px;
    color: var(--text-hi, #f0f0f0);
    font-family: var(--font-ui, sans-serif);
    font-size: 14px;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    transition: border-color 0.15s;
  }

  .brand-search::placeholder {
    color: var(--text-lo, #555);
  }

  .brand-search:focus {
    border-color: var(--amber, #f5a623);
  }

  /* Ocultar el botón nativo de clear en WebKit */
  .brand-search::-webkit-search-cancel-button {
    display: none;
  }

  .search-clear {
    position: absolute;
    right: 8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: none;
    background: var(--border-hi, #3a3a3a);
    color: var(--text-mid, #a0a0a0);
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s;
  }

  .search-clear:active {
    background: var(--amber, #f5a623);
    color: #000;
  }

  .no-results {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    color: var(--text-lo, #555);
    text-align: center;
    padding: 32px 16px;
    letter-spacing: 0.04em;
  }

  .scope-pills {
    display: flex;
    gap: 6px;
    padding: 12px 12px 0;
    flex-shrink: 0;
  }

  .scope-pill {
    flex: 1;
    height: 32px;
    border-radius: 20px;
    border: 1.5px solid var(--border, #2a2a2a);
    background: var(--bg-card, #1a1a1a);
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-ui, sans-serif);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      border-color 0.15s,
      color 0.15s,
      background 0.15s;
  }

  .scope-pill.active {
    border-color: var(--amber, #f5a623);
    color: var(--amber, #f5a623);
    background: #2a1e00;
  }

  .cat-pills {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 12px 12px 0;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .cat-pills::-webkit-scrollbar {
    display: none;
  }

  .cat-pills-wrap {
    display: flex;
    align-items: center;
    gap: 0;
    overflow: hidden;
  }
  .cat-pill-all {
    flex-shrink: 0;
    border-right: none;
    border-radius: 20px 0 0 20px;
    border-right: 1px solid var(--border);
    z-index: 1;
    background: var(--bg-card);
  }
  .cat-pill-all.active {
    border-color: var(--amber);
  }
  .cat-pills-scroll {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 0 12px;
    scrollbar-width: none;
    flex: 1;
  }
  .cat-pills-scroll::-webkit-scrollbar {
    display: none;
  }

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
    transition:
      border-color 0.15s,
      color 0.15s,
      background 0.15s;
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
    transition:
      border-color 0.15s,
      background 0.15s;
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
    min-height: 0; /* critical for flex children to shrink correctly */
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
    touch-action: pan-y; /* permitir scroll vertical, capturamos horizontal nosotros */
  }

  .card-slot {
    position: absolute;
    inset: 0 16px; /* margen lateral para ver los lados */
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
    transition:
      opacity 0.15s,
      border-color 0.15s;
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
    min-height: 16px;
  }

  .dot {
    width: var(--dot-size, 5.5px);
    height: var(--dot-size, 5.5px);
    border-radius: 50%;
    border: none;
    background: var(--border-hi, #3a3a3a);
    opacity: var(--dot-opacity, 0.5);
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
    transition:
      width 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94),
      height 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94),
      opacity 0.22s ease,
      background 0.2s;
  }

  .dot.active {
    background: var(--amber, #f5a623);
  }

  :global(.spin) {
    animation: spin 1.2s linear infinite;
  }
  .sd-filter-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    padding: 8px 0 4px;
    scrollbar-width: none;
  }
  .sd-filter-bar::-webkit-scrollbar {
    display: none;
  }
  .sd-filter-label {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-lo);
  }
  .sd-pill {
    flex-shrink: 0;
    height: 28px;
    padding: 0 10px;
    border-radius: 14px;
    border: 1.5px solid var(--border);
    background: var(--bg-card);
    color: var(--text-mid);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      border-color 0.15s,
      color 0.15s,
      background 0.15s;
  }
  .sd-pill.active {
    border-color: #60a5fa;
    color: #60a5fa;
    background: #0d1a2a;
  }
  :global([data-theme="light"]) .sd-pill.active {
    background: #eff6ff;
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
