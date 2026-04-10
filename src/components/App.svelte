<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Buscador        from './Buscador.svelte';
  import ResultsList     from './ResultsList.svelte';
  import StockModal      from './StockModal.svelte';
  import SyncStatus      from './SyncStatus.svelte';
  import DepotSelector   from './DepotSelector.svelte';
  import BottomNav       from './BottomNav.svelte';
  import SettingsSheet   from './SettingsSheet.svelte';

  import { isInitialized, countProducts, getDepots } from '../lib/idb';
  import { initialSync, initConnectivityListeners } from '../lib/sync';
  import { loadSavedDepot, setActiveDepot } from '../lib/depotStore';
  import { initTheme } from '../lib/themeStore';
  import type { Product, Depot } from '../lib/supabase';

  // ── Estado ─────────────────────────────────────────────────────
  let products:        Product[] = [];
  let isLoading        = false;
  let selectedProduct: Product | null = null;
  let modalOpen        = false;
  let activeCategory   = 'Todos';
  let appReady         = false;
  let initMessage      = '';
  let stockVersion     = 0;
  let depots: Depot[]  = [];
  let depot: Depot | null = null;
  let showSettings     = false;
  let cleanupListeners: () => void;

  $: depotId = depot?.id ?? 1;

  onMount(async () => {
    initTheme();
    cleanupListeners = initConnectivityListeners();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }

    depot  = loadSavedDepot();
    depots = await getDepots();

    const initialized = await isInitialized();
    const count       = await countProducts();

    if (initialized && count > 0) {
      appReady = true;
      initialSync();
    } else {
      initMessage = 'Descargando productos...';
      await initialSync();
      depots   = await getDepots();
      appReady    = true;
      initMessage = '';
    }
  });

  onDestroy(() => cleanupListeners?.());

  function handleResults(prods: Product[]) { products = prods; }
  function handleCategoryChange(cat: string) { activeCategory = cat; }

  function openModal(e: CustomEvent<{ product: Product }>) {
    selectedProduct = e.detail.product;
    modalOpen = true;
  }
  function closeModal() { modalOpen = false; selectedProduct = null; }
  function handleStockSaved() { stockVersion++; closeModal(); }

  function handleDepotSelected(d: Depot) {
    depot = d;
    setActiveDepot(d);
    showSettings = false;
    stockVersion++;
  }
</script>

{#if !appReady}
  <div class="splash">
    <div class="splash-logo">⬡</div>
    <div class="splash-name">DEPÓSITO</div>
    <div class="splash-spinner">⟳</div>
    <p class="splash-msg">{initMessage || 'Iniciando...'}</p>
  </div>

{:else if !depot}
  <DepotSelector {depots} on:selected={(e) => handleDepotSelected(e.detail)} />

{:else}
  <!-- Header compacto: solo marca + contexto -->
  <header class="app-header">
    <div class="header-brand">
      <span class="brand-icon">⬡</span>
      <div class="brand-text">
        <span class="brand-title">DEPÓSITO</span>
        <span class="brand-depot">{depot.name}</span>
      </div>
    </div>
    <SyncStatus />
  </header>

  <!-- Contenido principal (con padding para el bottom nav) -->
  <main class="app-main">
    <Buscador
      onResults={handleResults}
      onCategoryChange={handleCategoryChange}
      bind:isLoading
    />

    {#key stockVersion + '-' + depotId}
      <ResultsList
        {products}
        {isLoading}
        {depotId}
        on:addStock={openModal}
      />
    {/key}
  </main>

  <!-- Navegación inferior -->
  <BottomNav activePage="search" on:settings={() => showSettings = true} />

  <!-- Modal de stock -->
  <StockModal
    product={selectedProduct}
    open={modalOpen}
    {depotId}
    on:close={closeModal}
    on:saved={handleStockSaved}
  />

  <!-- Settings sheet -->
  <SettingsSheet
    open={showSettings}
    {products}
    {depotId}
    categoryLabel={activeCategory}
    {depots}
    activeDepot={depot}
    on:close={() => showSettings = false}
    on:depotSelected={(e) => handleDepotSelected(e.detail)}
  />
{/if}

<style>
  /* ── Splash ──────────────────────────────────────────────────── */
  .splash {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: var(--bg);
  }

  .splash-logo {
    font-size: 48px;
    color: var(--amber);
    line-height: 1;
  }

  .splash-name {
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 700;
    color: var(--amber);
    letter-spacing: 0.25em;
    margin-bottom: 24px;
  }

  .splash-spinner {
    font-size: 30px;
    color: var(--text-lo);
    animation: spin 1.2s linear infinite;
  }

  .splash-msg {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-lo);
    letter-spacing: 0.05em;
  }

  /* ── Header compacto ─────────────────────────────────────────── */
  .header-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-icon {
    font-size: 22px;
    color: var(--amber);
    line-height: 1;
  }

  .brand-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .brand-title {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    color: var(--amber);
    letter-spacing: 0.15em;
    line-height: 1;
  }

  .brand-depot {
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 600;
    color: var(--text-mid);
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* El main necesita espacio para el bottom nav (64px + safe-area) */
  .app-main {
    padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px) + var(--gap));
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
</style>
