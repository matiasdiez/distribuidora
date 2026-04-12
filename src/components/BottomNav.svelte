<script lang="ts">
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { getExpiringLots } from '../lib/idb';

  export let activePage: 'search' | 'swipe' | 'vencimientos' = 'search';

  const dispatch = createEventDispatcher<{ settings: void }>();

  let urgentCount = 0;
  let hasUrgent   = false;

  onMount(async () => {
    try {
      const lots = await getExpiringLots(30);
      urgentCount = lots.length;
      hasUrgent   = urgentCount > 0;
    } catch {
      // IndexedDB no inicializado aún — ignorar
    }
  });
</script>

<nav class="bottom-nav" role="navigation" aria-label="Navegación principal">

  <!-- Buscar -->
  <a href="/" class="nav-item" class:active={activePage === 'search'}
    aria-label="Buscar productos" aria-current={activePage === 'search' ? 'page' : undefined}>
    <span class="nav-icon">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    </span>
    <span class="nav-label">Buscar</span>
  </a>

  <!-- Swipe -->
  <a href="/swipe" class="nav-item" class:active={activePage === 'swipe'}
    aria-label="Modo swipe" aria-current={activePage === 'swipe' ? 'page' : undefined}>
    <span class="nav-icon">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 21 12 15 6"/><polyline points="9 18 3 12 9 6"/>
      </svg>
    </span>
    <span class="nav-label">Swipe</span>
  </a>

  <!-- Vencimientos — Bell / BellRing (Lucide) -->
  <a href="/vencimientos" class="nav-item" class:active={activePage === 'vencimientos'}
    aria-label="Alertas de vencimiento" aria-current={activePage === 'vencimientos' ? 'page' : undefined}>
    <span class="nav-icon bell-wrap">
      {#if hasUrgent}
        <!-- BellRing: campanilla con ondas de vibración -->
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
          <path d="M4 2C2.8 3.7 2 5.7 2 8"/>
          <path d="M20 2c1.2 1.7 2 3.7 2 6"/>
        </svg>
        {#if urgentCount > 0}
          <span class="bell-badge">{urgentCount > 99 ? '99+' : urgentCount}</span>
        {/if}
      {:else}
        <!-- Bell: campanilla estática -->
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      {/if}
    </span>
    <span class="nav-label">Alertas</span>
  </a>

  <!-- Ajustes -->
  <button class="nav-item" on:click={() => dispatch('settings')} aria-label="Ajustes" type="button">
    <span class="nav-icon">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </span>
    <span class="nav-label">Ajustes</span>
  </button>

</nav>

<style>
  .bottom-nav {
    position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
    width: 100%; max-width: 540px;
    height: calc(64px + env(safe-area-inset-bottom, 0px));
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: var(--bg-card);
    border-top: 1px solid var(--border);
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    align-items: stretch;
    z-index: 90;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .nav-item {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 4px; padding: 10px 6px;
    color: var(--text-lo); text-decoration: none;
    font-family: var(--font-ui); font-size: 11px; font-weight: 500; letter-spacing: 0.02em;
    border: none; background: transparent; cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: color 0.15s; position: relative;
  }

  .nav-item.active { color: var(--amber); }

  .nav-item.active::before {
    content: ''; position: absolute; top: 0; left: 25%; width: 50%; height: 2px;
    background: var(--amber); border-radius: 0 0 3px 3px;
  }

  .nav-icon {
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.15s;
  }

  .nav-item:active .nav-icon { transform: scale(0.88); }

  .nav-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }

  /* Bell badge */
  .bell-wrap { position: relative; }

  .bell-badge {
    position: absolute; top: -4px; right: -8px;
    min-width: 16px; height: 16px; border-radius: 8px;
    background: var(--red, #f87171); color: #fff;
    font-family: var(--font-mono, monospace); font-size: 9px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    padding: 0 3px; line-height: 1;
    animation: bell-pulse 2s ease-in-out infinite;
  }

  @keyframes bell-pulse {
    0%, 100% { transform: scale(1); }
    50%       { transform: scale(1.2); }
  }
</style>
