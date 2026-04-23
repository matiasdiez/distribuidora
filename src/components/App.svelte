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
  import Login from "./Login.svelte";
  import { Hexagon, Loader2, X, AlertTriangle, Bell, BellRing, Archive, BookOpen, Search } from 'lucide-svelte';

  import {
    isInitialized, countProducts, getDepots, getExpiringLots, confirmNoStock,
  } from "../lib/idb";
  import {
    initialSync, initConnectivityListeners,
    scheduleDailySync, isMorningSyncDone,
  } from "../lib/sync";
  import { loadSavedDepot, setActiveDepot, getAutoEnter } from "../lib/depotStore";
  import { initTheme } from "../lib/themeStore";
  import {
    AUTH_DISABLED, getSession, isAuthorized, signOut,
  } from "../lib/auth";
  import type { Product, Depot } from "../lib/supabase";
  import type { Session } from "@supabase/supabase-js";
  import { supabase } from "../lib/supabase";

  // ── Estado ──────────────────────────────────────────────────────
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
  let catalogMode = false;
  let cleanupListeners: () => void;
  let cleanupDailySync: () => void;
  let expiringCount = 0;
  let showExpiring = false;
  let expiringLots: Awaited<ReturnType<typeof getExpiringLots>> = [];

  // FAB — botón flotante "nueva búsqueda"
  let showFab = false;
  let buscadorRef: { focusInput: () => void };
  function onWindowScroll() { showFab = window.scrollY > 140; }
  function scrollToSearch() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => buscadorRef?.focusInput(), 320);
  }

  // SW update
  let swUpdateAvailable = false;
  let swRegistration: ServiceWorkerRegistration | null = null;

  // Auth
  let session: Session | null = null;
  let authChecked = false;
  let unauthorizedEmail = false;

  // Banner aviso sync matutina
  let showSyncWarning = false;

  $: depotId = depot?.id === 0 ? ("unassigned" as const) : (depot?.id ?? 1);
  $: searchDepot = catalogMode ? undefined : depotId;

  onMount(async () => {
    initTheme();
    if (typeof window !== 'undefined') window.addEventListener('scroll', onWindowScroll, { passive: true });

    // ── Auth ──────────────────────────────────────────────────────
    if (!AUTH_DISABLED) {
      // Escuchar cambios de sesión (callback de OAuth de Google)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (_event, s) => {
          session = s;
          if (s && !isAuthorized(s.user?.email)) {
            unauthorizedEmail = true;
            await signOut();
            session = null;
          }
        }
      );
      session = await getSession();
      if (session && !isAuthorized(session.user?.email)) {
        unauthorizedEmail = true;
        await signOut();
        session = null;
      }
      authChecked = true;
      if (!session) return; // no iniciar app hasta que haya sesión
    } else {
      authChecked = true;
    }

    await bootApp();
  });

  function activateUpdate() {
    // Pedirle al SW en espera que active inmediatamente
    swRegistration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    swUpdateAvailable = false;
    window.location.reload();
  }

  async function bootApp() {
    cleanupListeners = initConnectivityListeners();

    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.register("/sw.js").catch(console.error);
      if (reg) {
        swRegistration = reg;
        // Detectar SW esperando activación (nueva versión descargada)
        if (reg.waiting) swUpdateAvailable = true;
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              swUpdateAvailable = true;
            }
          });
        });
      }
      // El SW activo nos avisa cuando una nueva versión tomó el control
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'SW_UPDATED') swUpdateAvailable = true;
      });
    }

    depot = getAutoEnter() ? loadSavedDepot() : null;
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

    // Programar sync diaria a las 7:30 AM Buenos Aires
    const numDepotId = typeof depotId === "number" ? depotId : 1;
    cleanupDailySync = scheduleDailySync(numDepotId);

    // Banner aviso si ya son las 8 AM+ y la sync matutina no se hizo
    const nowBA = new Date(Date.now() - 3 * 3600 * 1000);
    const hourBA = nowBA.getUTCHours();
    if (hourBA >= 8) {
      const syncDone = await isMorningSyncDone();
      showSyncWarning = !syncDone;
    }
  }

  onDestroy(() => {
    cleanupListeners?.();
    cleanupDailySync?.();
    if (typeof window !== 'undefined') window.removeEventListener('scroll', onWindowScroll);
  });

  async function refreshExpiring() {
    expiringLots = await getExpiringLots(30);
    expiringCount = expiringLots.length;
  }

  function handleResults(prods: Product[]) { products = prods; }
  function handleCategoryChange(cat: string) { activeCategory = cat; }

  function openModal(e: CustomEvent<{ product: Product }>) {
    if (depotId === "unassigned") return;
    selectedProduct = e.detail.product;
    modalOpen = true;
  }
  function closeModal() { modalOpen = false; selectedProduct = null; }
  function handleStockSaved() { stockVersion++; closeModal(); }

  function handleDepotSelected(d: Depot) {
    depot = d; setActiveDepot(d); showSettings = false; stockVersion++;
  }
  function handleDepotsUpdated(updated: Depot[]) { depots = updated; }

  async function handleNoStock(e: CustomEvent<{ product: { id: number } }>) {
    if (typeof depotId !== "number") return;
    await confirmNoStock(e.detail.product.id, depotId);
    stockVersion++;
  }
</script>

<!-- ── Auth gate ──────────────────────────────────────────────────── -->
{#if !AUTH_DISABLED && authChecked && !session}
  <Login />
  {#if unauthorizedEmail}
    <div class="unauth-banner">
      <AlertTriangle size={14} strokeWidth={2.5} /> Ese email no tiene acceso autorizado.
    </div>
  {/if}

<!-- ── Splash de carga ────────────────────────────────────────────── -->
{:else if !appReady}
  <div class="splash">
    <div class="splash-logo"><Hexagon size={48} strokeWidth={1.5} /></div>
    <div class="splash-name">DEPÓSITO</div>
    <div class="splash-spinner"><Loader2 size={30} class="spin" /></div>
    <p class="splash-msg">{initMessage || "Iniciando..."}</p>
  </div>

<!-- ── Selector de depósito ───────────────────────────────────────── -->
{:else if !depot}
  <DepotSelector {depots} on:selected={(e) => handleDepotSelected(e.detail)} />

<!-- ── App principal ──────────────────────────────────────────────── -->
{:else}
  <!-- Banner: nueva versión de la app disponible -->
  {#if swUpdateAvailable}
    <div class="sw-update-banner">
      <span>🆕 Nueva versión disponible</span>
      <button class="sw-update-btn" on:click={activateUpdate}>Actualizar</button>
    </div>
  {/if}

  <!-- Banner aviso sync matutina no realizada -->
  {#if showSyncWarning}
    <div class="sync-warning-banner">
      <span class="sync-warn-inner"><AlertTriangle size={14} strokeWidth={2.5} /> La base de datos no se actualizó esta mañana.</span>
      <button class="sync-warning-close" on:click={() => (showSyncWarning = false)} aria-label="Cerrar"><X size={12} strokeWidth={2.5} /></button>
    </div>
  {/if}

  <!-- Header -->
  <header class="app-header">
    <div class="header-brand">
      <span class="brand-icon"><Hexagon size={22} strokeWidth={2} /></span>
      <div class="brand-text">
        <span class="brand-title">DEPÓSITO</span>
        <span class="brand-depot">{depot.name}</span>
      </div>
    </div>
    <div class="header-actions" style="display: flex; gap: 8px; align-items: center;">
      <!-- Campana -->
      <button
        class="bell-btn"
        class:has-alerts={expiringCount > 0}
        on:click={() => (showExpiring = true)}
        aria-label="{expiringCount} producto{expiringCount !== 1 ? 's' : ''} por vencer"
      >
        <span class="bell-wrap">
          {#if expiringCount > 0}
            <BellRing size={20} strokeWidth={2} />
            <span class="bell-badge">{expiringCount > 9 ? "9+" : expiringCount}</span>
          {:else}
            <Bell size={20} strokeWidth={2} />
          {/if}
        </span>
      </button>
      <ExportCSV {products} {depotId} categoryLabel={activeCategory} />
      <SyncStatus />
    </div>
  </header>

  <!-- Contenido principal -->
  <main class="app-main">
    <!-- Tab selector animado: Mi depósito / Todo el catálogo -->
    <div class="tab-rail" class:right={catalogMode}>
      <div class="tab-slider-bg"></div>
      <button
        class="tab-btn"
        class:tab-active={!catalogMode}
        on:click={() => { catalogMode = false; stockVersion++; }}
      >
        <Archive size={14} strokeWidth={2} />
        Mi depósito
      </button>
      <button
        class="tab-btn"
        class:tab-active={catalogMode}
        on:click={() => { catalogMode = true; stockVersion++; }}
      >
        <BookOpen size={14} strokeWidth={2} />
        Todo el catálogo
      </button>
    </div>

    <Buscador
      bind:this={buscadorRef}
      onResults={handleResults}
      onCategoryChange={handleCategoryChange}
      depotId={searchDepot}
      bind:isLoading
      bind:query={searchQuery}
    />

    {#key stockVersion + "-" + depotId + "-" + catalogMode}
      <ResultsList
        {products}
        {isLoading}
        depotId={searchDepot}
        query={searchQuery}
        activeDepotId={depotId}
        on:addStock={openModal}
        on:noStock={handleNoStock}
      />
    {/key}
  </main>

  <!-- FAB: volver al buscador -->
  {#if showFab}
    <button
      class="fab-search"
      on:click={scrollToSearch}
      aria-label="Nueva búsqueda"
    >
      <Search size={20} strokeWidth={2.5} />
    </button>
  {/if}

  <BottomNav activePage="search" on:settings={() => (showSettings = true)} />

  <StockModal
    product={selectedProduct}
    open={modalOpen}
    {depotId}
    on:close={closeModal}
    on:saved={handleStockSaved}
  />

  <!-- Panel de vencimientos -->
  {#if showExpiring}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="expiring-backdrop" on:click={() => (showExpiring = false)}>
      <div class="expiring-sheet" on:click|stopPropagation>
        <div class="expiring-header">
          <span class="expiring-title"><BellRing size={16} strokeWidth={2} /> Por vencer (30 días)</span>
          <button class="expiring-close" on:click={() => (showExpiring = false)} aria-label="Cerrar"><X size={13} strokeWidth={2.5} /></button>
        </div>
        {#if expiringLots.length === 0}
          <p class="expiring-empty">No hay productos por vencer en los próximos 30 días.</p>
        {:else}
          <div class="expiring-list">
            {#each expiringLots as lot}
              {@const daysLeft = Math.ceil((new Date(lot.expiry_date!).getTime() - Date.now()) / 86400000)}
              <div class="expiring-row" class:urgent={daysLeft <= 7}>
                <div class="expiring-info">
                  <span class="expiring-lot">{lot.lot_number}</span>
                  <span class="expiring-qty">
                    {#if (lot.boxes ?? 0) > 0}{lot.boxes} caja{lot.boxes !== 1 ? "s" : ""}{/if}
                    {#if lot.quantity > 0}{lot.quantity} u.{/if}
                  </span>
                </div>
                <span class="expiring-days" class:urgent={daysLeft <= 7}>
                  {daysLeft === 0 ? "hoy" : daysLeft === 1 ? "mañana" : `${daysLeft} días`}
                </span>
              </div>
            {/each}
          </div>
        {/if}
        <a href="/vencimientos" class="expiring-full-link">Ver página completa →</a>
      </div>
    </div>
  {/if}

  <SettingsSheet
    open={showSettings}
    {products}
    {depotId}
    categoryLabel={activeCategory}
    {depots}
    activeDepot={depot}
    on:close={() => (showSettings = false)}
    on:depotSelected={(e) => handleDepotSelected(e.detail)}
    on:depotsUpdated={(e) => handleDepotsUpdated(e.detail)}
    on:forceSync={() => { showSyncWarning = false; stockVersion++; }}
  />
{/if}

<style>
  /* ── Splash ─────────────────────────────────────────────────── */
  .splash {
    min-height: 100dvh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 8px; background: var(--bg);
  }
  .splash-logo { font-size: 48px; color: var(--amber); line-height: 1; }
  .splash-name { font-family: var(--font-mono); font-size: 15px; font-weight: 700; color: var(--amber); letter-spacing: 0.25em; margin-bottom: 24px; }
  .splash-spinner { font-size: 30px; color: var(--text-lo); animation: spin 1.2s linear infinite; }
  .splash-msg { font-family: var(--font-mono); font-size: 12px; color: var(--text-lo); letter-spacing: 0.05em; }

  /* ── Auth ───────────────────────────────────────────────────── */
  .unauth-banner {
    position: fixed; bottom: 0; left: 0; right: 0;
    padding: 14px 20px;
    background: var(--red-dim, #7f1d1d);
    border-top: 1px solid var(--red, #f87171);
    color: var(--red, #f87171);
    font-family: var(--font-mono, monospace);
    font-size: 13px; text-align: center;
    z-index: 2000;
  }

  /* ── Sync warning banner ────────────────────────────────────── */
  .sync-warning-banner {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px;
    background: #2a1a00;
    border-bottom: 1px solid var(--amber-dim, #b57a1a);
    color: var(--amber, #f5a623);
    font-family: var(--font-mono, monospace);
    font-size: 12px; font-weight: 700;
    gap: 12px;
  }
  .sw-update-banner {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px;
    background: var(--bg-input, #0d1a2a);
    border-bottom: 1px solid #1e3a5a;
    color: #60a5fa;
    font-family: var(--font-mono, monospace);
    font-size: 12px; font-weight: 700;
    gap: 12px;
  }
  .sw-update-btn {
    flex-shrink: 0; height: 28px; padding: 0 14px;
    border-radius: 14px; border: 1px solid #1e3a5a;
    background: var(--bg-card, #1a3050); color: var(--blue, #60a5fa);
    font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 700;
    cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  .sync-warning-close {
    flex-shrink: 0; width: 26px; height: 26px;
    border-radius: 50%; border: 1px solid var(--amber-dim, #b57a1a);
    background: none; color: var(--amber, #f5a623);
    font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  }

  /* ── Header ─────────────────────────────────────────────────── */
  .header-brand { display: flex; align-items: center; gap: 10px; }
  .brand-icon { font-size: 22px; color: var(--amber); line-height: 1; }
  .brand-text { display: flex; flex-direction: column; gap: 1px; }
  .brand-title { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--amber); letter-spacing: 0.15em; line-height: 1; }
  .brand-depot { font-family: var(--font-ui); font-size: 13px; font-weight: 600; color: var(--text-mid); line-height: 1; text-transform: uppercase; letter-spacing: 0.04em; }
  .app-main { padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px) + var(--gap)); }

  /* ── FAB: nueva búsqueda ─────────────────────────────────── */
  .fab-search {
    position: fixed;
    bottom: calc(68px + env(safe-area-inset-bottom, 0px));
    right: 18px;
    z-index: 40;
    width: 50px; height: 50px;
    border-radius: 50%;
    background: var(--amber);
    color: #000;
    border: none;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.45);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    animation: fab-in 0.2s cubic-bezier(0.34,1.4,0.64,1);
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .fab-search:active {
    transform: scale(0.91);
    box-shadow: 0 2px 10px rgba(0,0,0,0.35);
  }
  @keyframes fab-in {
    from { transform: scale(0.6) translateY(10px); opacity: 0; }
    to   { transform: scale(1)   translateY(0);    opacity: 1; }
  }

  /* ── Tab selector animado ───────────────────────────────────── */
  .tab-rail {
    position: relative; display: flex;
    background: var(--bg-input, #141414);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 10px; padding: 3px; height: 44px;
    margin: 8px 0 4px; overflow: hidden;
  }

  /* Pastilla deslizante */
  .tab-slider-bg {
    position: absolute; top: 3px; left: 3px;
    height: calc(100% - 6px);
    width: calc(50% - 3px);
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border-hi, #3a3a3a);
    border-radius: 8px;
    transition: transform 0.28s cubic-bezier(0.34, 1.3, 0.64, 1);
    pointer-events: none;
  }
  /* Al seleccionar "Todo el catálogo", la pastilla se desliza a la derecha */
  .tab-rail.right .tab-slider-bg { transform: translateX(calc(100% + 3px)); }

  .tab-btn {
    flex: 1; position: relative; z-index: 2;
    display: flex; align-items: center; justify-content: center; gap: 7px;
    font-family: var(--font-ui, sans-serif); font-size: 14px; font-weight: 600;
    color: var(--text-lo, #555);
    border: none; background: transparent; cursor: pointer;
    border-radius: 8px; transition: color 0.2s;
    -webkit-tap-highlight-color: transparent;
    letter-spacing: 0.01em;
  }
  .tab-btn.tab-active { color: var(--text-hi, #f0f0f0); }

  /* ── Campana ─────────────────────────────────────────────────── */
  .bell-btn {
    position: relative; width: 38px; height: 38px; border-radius: 50%;
    border: 1.5px solid var(--border, #2a2a2a); background: var(--bg-card, #1a1a1a);
    color: var(--text-mid, #a0a0a0); cursor: pointer; display: flex;
    align-items: center; justify-content: center;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, color 0.15s; flex-shrink: 0;
  }
  .bell-btn.has-alerts { border-color: var(--red, #f87171); color: var(--red, #f87171); }
  .bell-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
  .bell-btn.has-alerts .bell-wrap svg { animation: bell-ring 2.4s ease-in-out infinite; transform-origin: top center; }
  @keyframes bell-ring {
    0%, 100% { transform: rotate(0deg); } 10% { transform: rotate(14deg); }
    20% { transform: rotate(-12deg); } 30% { transform: rotate(10deg); }
    40% { transform: rotate(-8deg); } 50% { transform: rotate(0deg); }
  }
  .bell-badge {
    position: absolute; top: -5px; right: -7px; min-width: 16px; height: 16px;
    padding: 0 3px; border-radius: 8px; background: var(--red, #f87171);
    color: #000; font-family: var(--font-mono, monospace); font-size: 9px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; line-height: 1;
  }

  /* ── Vencimientos ───────────────────────────────────────────── */
  .expiring-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 200; display: flex; align-items: flex-end; }
  .expiring-sheet { background: var(--bg-card, #1a1a1a); border: 1px solid var(--border-hi, #3a3a3a); border-bottom: none; border-radius: 16px 16px 0 0; width: 100%; max-height: 70dvh; overflow-y: auto; animation: slide-up 0.22s ease-out; }
  .expiring-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 16px 14px; border-bottom: 1px solid var(--border, #2a2a2a); }
  .expiring-title { font-family: var(--font-mono, monospace); font-size: 13px; font-weight: 700; color: var(--text-hi, #f0f0f0); letter-spacing: 0.05em; }
  .expiring-close { width: 32px; height: 32px; border-radius: 50%; background: var(--bg, #0d0d0d); border: 1px solid var(--border, #2a2a2a); color: var(--text-mid, #a0a0a0); font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .expiring-empty { padding: 24px 16px; font-family: var(--font-mono, monospace); font-size: 12px; color: var(--text-lo, #555); text-align: center; }
  .expiring-list { padding: 10px 16px 24px; display: flex; flex-direction: column; gap: 8px; }
  .expiring-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: var(--bg, #0d0d0d); border: 1px solid var(--border, #2a2a2a); border-radius: 6px; gap: 12px; }
  .expiring-row.urgent { border-color: var(--red, #f87171); background: #2a0a0a; }
  .expiring-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .expiring-lot { font-family: var(--font-mono, monospace); font-size: 13px; font-weight: 700; color: var(--amber, #f5a623); }
  .expiring-qty { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--text-mid, #a0a0a0); }
  .expiring-days { font-family: var(--font-mono, monospace); font-size: 13px; font-weight: 700; color: var(--text-mid, #a0a0a0); white-space: nowrap; flex-shrink: 0; }
  .expiring-days.urgent { color: var(--red, #f87171); }
  .expiring-full-link {
    display: block;
    text-align: center;
    padding: 14px 16px;
    border-top: 1px solid var(--border, #2a2a2a);
    color: var(--amber, #f5a623);
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s;
  }
  .expiring-full-link:active { background: var(--amber-bg, #2a1e00); }

  @keyframes slide-up {
    from { transform: translateY(40px); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
  }
  :global(.spin) { animation: spin 1.2s linear infinite; }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
</style>
