<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { getDepots } from '../lib/idb';
  import { setActiveDepot } from '../lib/depotStore';
  import type { Depot } from '../lib/supabase';

  const dispatch = createEventDispatcher<{ selected: Depot }>();

  export let depots: Depot[] = [];

  function choose(depot: Depot) {
    setActiveDepot(depot);
    dispatch('selected', depot);
  }
</script>

<div class="selector-screen">

  <div class="selector-head">
    <div class="logo">⬡ DEPÓSITO</div>
    <p class="subtitle">Seleccioná tu depósito</p>
  </div>

  {#if depots.length === 0}
    <div class="empty">
      <span class="spin">⟳</span>
      <p>Cargando depósitos...</p>
    </div>

  {:else}
    <ul class="depot-list">
      {#each depots as depot}
        <li>
          <button class="depot-btn" on:click={() => choose(depot)}>
            <span class="depot-icon">⬡</span>
            <span class="depot-name">{depot.name}</span>
            <span class="depot-arrow">→</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

</div>

<style>
  .selector-screen {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 32px;
    padding: 32px 20px;
    background: var(--bg);
  }

  /* Head */
  .selector-head {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .logo {
    font-family: var(--font-mono);
    font-size: 22px;
    font-weight: 700;
    color: var(--amber);
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .subtitle {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-lo);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  /* Lista */
  .depot-list {
    list-style: none;
    width: 100%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .depot-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    background: var(--bg-card);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, background 0.15s, transform 0.1s;
    text-align: left;
  }

  .depot-btn:active {
    border-color: var(--amber);
    background: color-mix(in srgb, var(--amber) 8%, var(--bg-card));
    transform: scale(0.98);
  }

  .depot-icon {
    font-size: 22px;
    color: var(--amber);
    flex-shrink: 0;
  }

  .depot-name {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 700;
    color: var(--text-hi);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .depot-arrow {
    font-size: 18px;
    color: var(--text-lo);
    flex-shrink: 0;
  }

  /* Empty / loading */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    color: var(--text-lo);
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.05em;
  }

  .spin {
    font-size: 28px;
    color: var(--amber);
    animation: spin 1.2s linear infinite;
    display: inline-block;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
</style>
