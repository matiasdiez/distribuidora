<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Buscador from "./Buscador.svelte";
  import ResultsList from "./ResultsList.svelte";
  import StockModal from "./StockModal.svelte";
  import SyncStatus from "./SyncStatus.svelte";
  import ExportCSV from "./ExportCSV.svelte";
  import DepotSelector from "./DepotSelector.svelte";
  import BottomNav from "./BottomNav.svelte";
  import SettingsSheet from "./SettingsSheet.svelte";

  import {
    isInitialized,
    countProducts,
    getDepots,
    getExpiringLots,
  } from "../lib/idb";
  import { initialSync, initConnectivityListeners } from "../lib/sync";
  import { loadSavedDepot, setActiveDepot } from "../lib/depotStore";
  import { initTheme } from "../lib/themeStore";
  import type { Product, Depot } from "../lib/supabase";

  // ── Estado ─────────────────────────────────────────────────────
  let products: Product[] = [];
  let isLoading = false;
  let selectedProduct: Product | null = null;
  let searchQuery = "";
  let modalOpen = false;
  let activeCategory = "Todos";
  let appReady = false;
  let initMessage = "";
  let stockVersion = 0;
  let depots: Depot[] = [];
  let depot: Depot | null = null;
  let showSettings = false;
  let cleanupListeners: () => void;
  let expiringCount = 0;
  let showExpiring = false;
  let expiringLots: Awaited<ReturnType<typeof getExpiringLots>> = [];

  $: depotId = depot?.id === 0 ? ("unassigned" as const) : (depot?.id ?? 1);

  onMount(async () => {
    initTheme();
    cleanupListeners = initConnectivityListeners();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }

    depot = loadSavedDepot();
    depots = await getDepots();

    const initialized = await isInitialized();
    const count = await countProducts();

    if (initialized && count > 0) {
      appReady = true;
      initialSync();
      refreshExpiring();
    } else {
      initMessage = "Descargando productos...";
      await initialSync();
      depots = await getDepots();
      appReady = true;
      initMessage = "";
      refreshExpiring();
    }
  });

  onDestroy(() => cleanupListeners?.());

  async function refreshExpiring() {
    expiringLots = await getExpiringLots(30);
    expiringCount = expiringLots.length;
  }

  function handleResults(prods: Product[]) {
    products = prods;
  }
  function handleCategoryChange(cat: string) {
    activeCategory = cat;
  }

  function openModal(e: CustomEvent<{ product: Product }>) {
    if (depotId === "unassigned") return; // sin depósito, no se puede agregar stock
    selectedProduct = e.detail.product;
    modalOpen = true;
  }
  function closeModal() {
    modalOpen = false;
    selectedProduct = null;
  }
  function handleStockSaved() {
    stockVersion++;
    closeModal();
  }

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
    <p class="splash-msg">{initMessage || "Iniciando..."}</p>
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
    <div
      class="header-actions"
      style="display: flex; gap: 8px; align-items: center;"
    >
      <!-- Campana de notificaciones de vencimiento -->
      <button
        class="bell-btn"
        class:has-alerts={expiringCount > 0}
        on:click={() => (showExpiring = true)}
        aria-label="{expiringCount} producto{expiringCount !== 1
          ? 's'
          : ''} por vencer"
      >
        🔔
        {#if expiringCount > 0}
          <span class="bell-badge"
            >{expiringCount > 9 ? "9+" : expiringCount}</span
          >
        {/if}
      </button>
      <ExportCSV {products} {depotId} categoryLabel={activeCategory} />
      <SyncStatus />
    </div>
  </header>

  <!-- Contenido principal (con padding para el bottom nav) -->
  <main class="app-main">
    <Buscador
      onResults={handleResults}
      onCategoryChange={handleCategoryChange}
      bind:isLoading
      bind:query={searchQuery}
    />

    {#key stockVersion + "-" + depotId}
      <ResultsList
        {products}
        {isLoading}
        {depotId}
        query={searchQuery}
        on:addStock={openModal}
      />
    {/key}
  </main>

  <!-- Navegación inferior -->
  <BottomNav activePage="search" on:settings={() => (showSettings = true)} />

  <!-- Modal de stock -->
  <StockModal
    product={selectedProduct}
    open={modalOpen}
    {depotId}
    on:close={closeModal}
    on:saved={handleStockSaved}
  />

  <!-- Panel de productos por vencer -->
  {#if showExpiring}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="expiring-backdrop" on:click={() => (showExpiring = false)}>
      <div class="expiring-sheet" on:click|stopPropagation>
        <div class="expiring-header">
          <span class="expiring-title">🔔 Por vencer (30 días)</span>
          <button class="expiring-close" on:click={() => (showExpiring = false)}
            >✕</button
          >
        </div>
        {#if expiringLots.length === 0}
          <p class="expiring-empty">
            No hay productos por vencer en los próximos 30 días.
          </p>
        {:else}
          <div class="expiring-list">
            {#each expiringLots as lot}
              {@const daysLeft = Math.ceil(
                (new Date(lot.expiry_date!).getTime() - Date.now()) / 86400000,
              )}
              <div class="expiring-row" class:urgent={daysLeft <= 7}>
                <div class="expiring-info">
                  <span class="expiring-lot">{lot.lot_number}</span>
                  <span class="expiring-qty">
                    {#if (lot.boxes ?? 0) > 0}{lot.boxes} caja{lot.boxes !== 1
                        ? "s"
                        : ""}{/if}
                    {#if lot.quantity > 0}{lot.quantity} u.{/if}
                  </span>
                </div>
                <span class="expiring-days" class:urgent={daysLeft <= 7}>
                  {daysLeft === 0
                    ? "hoy"
                    : daysLeft === 1
                      ? "mañana"
                      : `${daysLeft} días`}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Settings sheet -->
  <SettingsSheet
    open={showSettings}
    {products}
    {depotId}
    categoryLabel={activeCategory}
    {depots}
    activeDepot={depot}
    on:close={() => (showSettings = false)}
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

  /* ── Campana ─────────────────────────────────────────────── */
  .bell-btn {
    position: relative;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 1.5px solid var(--border, #2a2a2a);
    background: var(--bg-card, #1a1a1a);
    font-size: 17px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s;
    flex-shrink: 0;
  }

  .bell-btn.has-alerts {
    border-color: var(--red, #f87171);
  }

  .bell-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    padding: 0 3px;
    border-radius: 8px;
    background: var(--red, #f87171);
    color: #000;
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  /* ── Panel de vencimientos ──────────────────────────────── */
  .expiring-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 200;
    display: flex;
    align-items: flex-end;
  }

  .expiring-sheet {
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border-hi, #3a3a3a);
    border-bottom: none;
    border-radius: 16px 16px 0 0;
    width: 100%;
    max-height: 70dvh;
    overflow-y: auto;
    animation: slide-up 0.22s ease-out;
  }

  .expiring-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 16px 14px;
    border-bottom: 1px solid var(--border, #2a2a2a);
  }

  .expiring-title {
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: var(--text-hi, #f0f0f0);
    letter-spacing: 0.05em;
  }

  .expiring-close {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--bg, #0d0d0d);
    border: 1px solid var(--border, #2a2a2a);
    color: var(--text-mid, #a0a0a0);
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .expiring-empty {
    padding: 24px 16px;
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    color: var(--text-lo, #555);
    text-align: center;
  }

  .expiring-list {
    padding: 10px 16px 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .expiring-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--bg, #0d0d0d);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 6px;
    gap: 12px;
  }

  .expiring-row.urgent {
    border-color: var(--red, #f87171);
    background: #2a0a0a;
  }

  .expiring-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .expiring-lot {
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: var(--amber, #f5a623);
  }

  .expiring-qty {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--text-mid, #a0a0a0);
  }

  .expiring-days {
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: var(--text-mid, #a0a0a0);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .expiring-days.urgent {
    color: var(--red, #f87171);
  }

  @keyframes slide-up {
    from {
      transform: translateY(40px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
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
