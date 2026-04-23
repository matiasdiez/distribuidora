<script
 lang="ts">
  import { Hexagon, Loader2, ChevronRight } from "lucide-svelte";
  import { createEventDispatcher } from "svelte";
  import { getDepots } from "../lib/idb";
  import { setActiveDepot } from "../lib/depotStore";
  import type { Depot } from "../lib/supabase";

  const dispatch = createEventDispatcher<{ selected: Depot }>();

  export let depots: Depot[] = [];

  function choose(depot: Depot) {
    setActiveDepot(depot);
    dispatch("selected", depot);
  }
</script>

<div class="selector-screen">
  <div class="selector-head">
    <div class="logo"><Hexagon size={14} strokeWidth={2.5} /> DEPÓSITO</div>
    <p class="subtitle">Seleccioná tu depósito</p>
  </div>

  {#if depots.length === 0}
    <div class="empty">
      <Loader2 size={28} strokeWidth={1.5} class="spin" />
      <p>Cargando depósitos...</p>
    </div>
  {:else}
    <ul class="depot-list">
      {#each depots as depot}
        <li>
          <button class="depot-btn" on:click={() => choose(depot)}>
            <span class="depot-icon"><Hexagon size={18} strokeWidth={2} /></span>
            <span class="depot-name">{depot.name}</span>
            <span class="depot-arrow"><ChevronRight size={16} strokeWidth={2} /></span>
          </button>
        </li>
      {/each}

      <!-- Opción especial: productos sin depósito asignado -->
      <li class="unassigned-sep">
        <span class="sep-label">Sin asignar</span>
      </li>
      <li>
        <button
          class="depot-btn unassigned-btn"
          on:click={() => choose({ id: 0, name: "Sin depósito" })}
        >
          <span class="depot-icon unassigned-icon">◌</span>
          <span class="depot-name">Sin depósito</span>
          <span class="depot-arrow"><ChevronRight size={16} strokeWidth={2} /></span>
        </button>
      </li>
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
    transition:
      border-color 0.15s,
      background 0.15s,
      transform 0.1s;
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

  :global(.spin) {
    font-size: 28px;
    color: var(--amber);
    animation: spin 1.2s linear infinite;
    display: inline-block;
  }

  .unassigned-sep {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .sep-label {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--text-lo);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    white-space: nowrap;
  }

  .unassigned-btn {
    border-style: dashed;
    opacity: 0.7;
  }

  .unassigned-btn:active {
    opacity: 1;
  }

  .unassigned-icon {
    color: var(--text-lo);
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
