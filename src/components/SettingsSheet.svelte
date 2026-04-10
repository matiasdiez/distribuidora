<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import ExportCSV  from './ExportCSV.svelte';
  import { theme, toggleTheme } from '../lib/themeStore';
  import { setActiveDepot } from '../lib/depotStore';
  import type { Product, Depot } from '../lib/supabase';

  export let open      = false;
  export let products: Product[]  = [];
  export let depotId: number      = 1;
  export let categoryLabel        = 'Todos';
  export let depots: Depot[]      = [];
  export let activeDepot: Depot | null = null;

  const dispatch = createEventDispatcher<{
    close:         void;
    depotSelected: Depot;
  }>();

  function close() { dispatch('close'); }

  function chooseDepot(d: Depot) {
    setActiveDepot(d);
    dispatch('depotSelected', d);
    close();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={handleBackdrop}>
    <div class="sheet" role="dialog" aria-label="Ajustes">

      <div class="sheet-handle"></div>

      <div class="sheet-header">
        <span class="sheet-title">Ajustes</span>
        <button class="close-btn" on:click={close} aria-label="Cerrar">✕</button>
      </div>

      <!-- Sección: Depósito activo -->
      <section class="section">
        <p class="section-label">Depósito activo</p>
        <div class="depot-list">
          {#each depots as d}
            <button
              class="depot-row"
              class:active={d.id === activeDepot?.id}
              on:click={() => chooseDepot(d)}
            >
              <span class="depot-icon">⬡</span>
              <span class="depot-name">{d.name}</span>
              {#if d.id === activeDepot?.id}
                <span class="depot-check">✓</span>
              {:else}
                <span class="depot-arrow">→</span>
              {/if}
            </button>
          {/each}
        </div>
      </section>

      <div class="divider"></div>

      <!-- Sección: Tema -->
      <section class="section">
        <p class="section-label">Apariencia</p>
        <button class="action-row" on:click={toggleTheme}>
          <span class="action-icon">{$theme === 'dark' ? '☀' : '☾'}</span>
          <span class="action-label">
            {$theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          </span>
          <span class="action-badge">{$theme === 'dark' ? 'Dark' : 'Light'}</span>
        </button>
      </section>

      <div class="divider"></div>

      <!-- Sección: Exportar -->
      <section class="section">
        <p class="section-label">Exportar</p>
        <div class="export-wrap">
          <ExportCSV {products} {depotId} {categoryLabel} />
          <span class="export-hint">
            Exporta {products.length} producto{products.length !== 1 ? 's' : ''} visibles como CSV
          </span>
        </div>
      </section>

    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 200;
    display: flex;
    align-items: flex-end;
  }

  .sheet {
    width: 100%;
    background: var(--bg-card);
    border: 1px solid var(--border-hi);
    border-bottom: none;
    border-radius: 20px 20px 0 0;
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    max-height: 85dvh;
    overflow-y: auto;
    animation: slide-up 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes slide-up {
    from { transform: translateY(40px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }

  /* Handle */
  .sheet-handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--border-hi);
    margin: 12px auto 0;
  }

  /* Header */
  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px 12px;
  }

  .sheet-title {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    color: var(--text-lo);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .close-btn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-mid);
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  /* Sections */
  .section {
    padding: 10px 16px 14px;
  }

  .section-label {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-lo);
    margin-bottom: 10px;
  }

  .divider {
    height: 1px;
    background: var(--border);
    margin: 0 16px;
  }

  /* Depots */
  .depot-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .depot-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 15px;
    background: var(--bg);
    border: 1.5px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, background 0.15s;
    text-align: left;
  }

  .depot-row.active {
    border-color: var(--amber);
    background: color-mix(in srgb, var(--amber) 8%, var(--bg));
  }

  .depot-icon { font-size: 16px; color: var(--amber); flex-shrink: 0; }

  .depot-name {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 700;
    color: var(--text-hi);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .depot-check { color: var(--amber); font-size: 13px; font-weight: 700; }
  .depot-arrow { color: var(--text-lo); font-size: 14px; }

  /* Actions */
  .action-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 15px;
    background: var(--bg);
    border: 1.5px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s;
    text-align: left;
  }

  .action-row:active { border-color: var(--amber); }

  .action-icon { font-size: 18px; flex-shrink: 0; }

  .action-label {
    flex: 1;
    font-family: var(--font-ui);
    font-size: 15px;
    font-weight: 500;
    color: var(--text-hi);
  }

  .action-badge {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-lo);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 7px;
    flex-shrink: 0;
  }

  /* Export wrap */
  .export-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .export-hint {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-lo);
    letter-spacing: 0.03em;
  }
</style>
