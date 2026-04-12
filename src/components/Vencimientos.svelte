<script lang="ts">
  import { onMount } from 'svelte';
  import { getExpiringLots, getDB } from '../lib/idb';
  import { initialSync, initConnectivityListeners } from '../lib/sync';
  import type { StockEntry } from '../lib/supabase';

  // Días a mostrar — se puede cambiar con las tabs
  let daysFilter: 7 | 30 | 60 | 90 = 30;
  let lots: (StockEntry & { local_id?: number })[] = [];
  let productNames: Record<number, { brand: string; description: string; weight_qty: string | null }> = {};
  let depotNames: Record<number, string> = {};
  let loading = true;

  onMount(async () => {
    const cleanup = initConnectivityListeners();
    await initialSync();
    await load();
    loading = false;
    return cleanup;
  });

  async function load() {
    loading = true;
    lots = await getExpiringLots(daysFilter);

    // Cargar nombres de productos y depósitos
    const db = await getDB();
    const allProducts = await db.getAll('products');
    const allDepots   = await db.getAll('depots');

    productNames = {};
    for (const p of allProducts) {
      productNames[p.id] = { brand: p.brand, description: p.description, weight_qty: p.weight_qty };
    }

    depotNames = {};
    for (const d of allDepots) {
      depotNames[d.id] = d.name;
    }
    loading = false;
  }

  $: { daysFilter; load(); }

  // Ordenar por fecha de vencimiento ascendente
  $: sorted = [...lots].sort((a, b) => {
    const da = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
    const db = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
    return da - db;
  });

  // Agrupar por urgencia
  $: urgent  = sorted.filter(l => daysUntil(l.expiry_date!) <= 7);
  $: soon    = sorted.filter(l => { const d = daysUntil(l.expiry_date!); return d > 7 && d <= 30; });
  $: later   = sorted.filter(l => daysUntil(l.expiry_date!) > 30);

  function daysUntil(iso: string): number {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  }

  function formatDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  }

  function stockLabel(lot: StockEntry): string {
    const parts: string[] = [];
    if ((lot.boxes ?? 0) > 0) parts.push(`${lot.boxes} caja${lot.boxes !== 1 ? 's' : ''}`);
    if (lot.quantity > 0) parts.push(`${lot.quantity} u.`);
    return parts.join(' + ') || '—';
  }

  // ── Exportar CSV ─────────────────────────────────────────────
  function exportCSV() {
    const header = ['Marca', 'Descripción', 'Peso/Cant', 'Depósito', 'Lote', 'Unidades', 'Cajas', 'Vencimiento', 'Días restantes'];
    const rows = sorted.map(lot => {
      const p = productNames[lot.product_id];
      const days = daysUntil(lot.expiry_date!);
      return [
        p?.brand ?? '',
        p?.description ?? '',
        p?.weight_qty ?? '',
        depotNames[lot.depot_id] ?? lot.depot_id,
        lot.lot_number,
        lot.quantity,
        lot.boxes ?? 0,
        formatDate(lot.expiry_date!),
        days,
      ];
    });

    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `vencimientos_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="venc-app">

  <!-- Header -->
  <header class="app-header">
    <div class="header-left">
      <a href="/" class="back-link" title="Volver">←</a>
      <div class="app-logo">⬡ VENCIMIENTOS</div>
    </div>
    <button class="export-btn" on:click={exportCSV} title="Exportar CSV" disabled={loading || sorted.length === 0}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>CSV</span>
    </button>
  </header>

  <!-- Tabs de período -->
  <div class="tabs">
    {#each ([7, 30, 60, 90] as const) as d}
      <button
        class="tab"
        class:active={daysFilter === d}
        on:click={() => daysFilter = d}
      >
        {d === 7 ? 'Esta semana' : d === 30 ? '30 días' : d === 60 ? '60 días' : '90 días'}
      </button>
    {/each}
  </div>

  {#if loading}
    <div class="splash">
      <span class="spin">⟳</span>
      <p>Cargando lotes...</p>
    </div>

  {:else if sorted.length === 0}
    <div class="empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-lo)">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <p>Sin lotes próximos a vencer en los próximos {daysFilter} días</p>
    </div>

  {:else}
    <div class="summary-bar">
      {#if urgent.length > 0}
        <span class="summary-chip chip-urgent">🔴 {urgent.length} urgente{urgent.length !== 1 ? 's' : ''} (≤7d)</span>
      {/if}
      {#if soon.length > 0}
        <span class="summary-chip chip-soon">🟠 {soon.length} próximo{soon.length !== 1 ? 's' : ''} (≤30d)</span>
      {/if}
      {#if later.length > 0}
        <span class="summary-chip chip-later">🟡 {later.length} en {daysFilter}d</span>
      {/if}
    </div>

    <div class="lot-list">

      <!-- Urgentes (≤7 días) -->
      {#if urgent.length > 0}
        <div class="section-label label-urgent">⚠ Vencen en 7 días o menos</div>
        {#each urgent as lot (lot.id)}
          {@const p = productNames[lot.product_id]}
          {@const days = daysUntil(lot.expiry_date!)}
          <div class="lot-row row-urgent">
            <div class="lot-info">
              <div class="lot-top">
                <span class="lot-brand">{p?.brand ?? '—'}</span>
                <span class="lot-num">{lot.lot_number}</span>
              </div>
              <div class="lot-desc">{p?.description ?? '—'}{p?.weight_qty ? ` ${p.weight_qty}` : ''}</div>
              <div class="lot-meta">
                <span class="lot-depot">{depotNames[lot.depot_id] ?? `Dep. ${lot.depot_id}`}</span>
                <span class="lot-stock">{stockLabel(lot)}</span>
              </div>
            </div>
            <div class="lot-expiry expiry-urgent">
              <span class="exp-date">{formatDate(lot.expiry_date!)}</span>
              <span class="exp-days">{days === 0 ? 'HOY' : days < 0 ? `vencido` : `${days}d`}</span>
            </div>
          </div>
        {/each}
      {/if}

      <!-- Próximos (8–30 días) -->
      {#if soon.length > 0}
        <div class="section-label label-soon">Vencen entre 8 y 30 días</div>
        {#each soon as lot (lot.id)}
          {@const p = productNames[lot.product_id]}
          {@const days = daysUntil(lot.expiry_date!)}
          <div class="lot-row row-soon">
            <div class="lot-info">
              <div class="lot-top">
                <span class="lot-brand">{p?.brand ?? '—'}</span>
                <span class="lot-num">{lot.lot_number}</span>
              </div>
              <div class="lot-desc">{p?.description ?? '—'}{p?.weight_qty ? ` ${p.weight_qty}` : ''}</div>
              <div class="lot-meta">
                <span class="lot-depot">{depotNames[lot.depot_id] ?? `Dep. ${lot.depot_id}`}</span>
                <span class="lot-stock">{stockLabel(lot)}</span>
              </div>
            </div>
            <div class="lot-expiry expiry-soon">
              <span class="exp-date">{formatDate(lot.expiry_date!)}</span>
              <span class="exp-days">{days}d</span>
            </div>
          </div>
        {/each}
      {/if}

      <!-- Más adelante (31–N días) -->
      {#if later.length > 0}
        <div class="section-label label-later">Vencen entre 31 y {daysFilter} días</div>
        {#each later as lot (lot.id)}
          {@const p = productNames[lot.product_id]}
          {@const days = daysUntil(lot.expiry_date!)}
          <div class="lot-row row-later">
            <div class="lot-info">
              <div class="lot-top">
                <span class="lot-brand">{p?.brand ?? '—'}</span>
                <span class="lot-num">{lot.lot_number}</span>
              </div>
              <div class="lot-desc">{p?.description ?? '—'}{p?.weight_qty ? ` ${p.weight_qty}` : ''}</div>
              <div class="lot-meta">
                <span class="lot-depot">{depotNames[lot.depot_id] ?? `Dep. ${lot.depot_id}`}</span>
                <span class="lot-stock">{stockLabel(lot)}</span>
              </div>
            </div>
            <div class="lot-expiry expiry-later">
              <span class="exp-date">{formatDate(lot.expiry_date!)}</span>
              <span class="exp-days">{days}d</span>
            </div>
          </div>
        {/each}
      {/if}

    </div>
  {/if}

</div>

<style>
  .venc-app {
    min-height: 100dvh;
    background: var(--bg, #0d0d0d);
    color: var(--text-hi, #f0f0f0);
    font-family: var(--font-ui, 'Barlow Condensed', sans-serif);
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border, #2a2a2a);
    position: sticky;
    top: 0;
    background: var(--bg, #0d0d0d);
    z-index: 100;
  }

  .header-left { display: flex; align-items: center; gap: 10px; }

  .back-link {
    width: 36px; height: 36px;
    border-radius: 8px;
    border: 1px solid var(--border, #2a2a2a);
    background: var(--bg-card, #1a1a1a);
    color: var(--text-hi, #f0f0f0);
    font-size: 18px;
    display: flex; align-items: center; justify-content: center;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
  }

  .app-logo {
    font-family: var(--font-mono, monospace);
    font-size: 13px; font-weight: 700;
    color: var(--amber, #f5a623);
    letter-spacing: 0.05em;
  }

  .export-btn {
    display: flex; align-items: center; gap: 6px;
    height: 34px; padding: 0 12px;
    border-radius: 7px;
    border: 1.5px solid var(--border-hi, #3a3a3a);
    background: var(--bg-card, #1a1a1a);
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-mono, monospace);
    font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, color 0.15s;
  }
  .export-btn:not(:disabled):hover { border-color: var(--amber, #f5a623); color: var(--amber, #f5a623); }
  .export-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Tabs */
  .tabs {
    display: flex; gap: 6px;
    overflow-x: auto; padding: 10px 12px;
    scrollbar-width: none; flex-shrink: 0;
  }
  .tabs::-webkit-scrollbar { display: none; }

  .tab {
    flex-shrink: 0; height: 30px; padding: 0 12px;
    border-radius: 20px;
    border: 1.5px solid var(--border, #2a2a2a);
    background: var(--bg-card, #1a1a1a);
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-ui, sans-serif);
    font-size: 13px; font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .tab.active {
    border-color: var(--amber, #f5a623);
    color: var(--amber, #f5a623);
    background: #2a1e00;
  }

  /* Summary bar */
  .summary-bar {
    display: flex; gap: 6px; flex-wrap: wrap;
    padding: 0 12px 10px;
  }
  .summary-chip {
    font-family: var(--font-mono, monospace);
    font-size: 11px; font-weight: 700;
    padding: 3px 8px; border-radius: 4px;
  }
  .chip-urgent { background: #2a0a0a; color: var(--red, #f87171); }
  .chip-soon   { background: #2a1400; color: #fb923c; }
  .chip-later  { background: #2a1e00; color: var(--amber, #f5a623); }

  /* List */
  .lot-list {
    flex: 1; overflow-y: auto;
    padding: 0 12px 40px;
    display: flex; flex-direction: column; gap: 4px;
  }

  .section-label {
    font-family: var(--font-mono, monospace);
    font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em;
    padding: 14px 2px 4px;
  }
  .label-urgent { color: var(--red, #f87171); }
  .label-soon   { color: #fb923c; }
  .label-later  { color: var(--amber, #f5a623); }

  .lot-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px;
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 8px;
  }
  .row-urgent { border-color: #3a0a0a; }
  .row-soon   { border-color: #2a1400; }

  .lot-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }

  .lot-top { display: flex; align-items: center; gap: 8px; }

  .lot-brand {
    font-family: var(--font-mono, monospace);
    font-size: 10px; font-weight: 700;
    color: var(--amber, #f5a623);
    text-transform: uppercase; letter-spacing: 0.04em;
  }

  .lot-num {
    font-family: var(--font-mono, monospace);
    font-size: 10px; color: var(--text-lo, #555);
  }

  .lot-desc {
    font-size: 15px; font-weight: 600;
    color: var(--text-hi, #f0f0f0);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .lot-meta { display: flex; align-items: center; gap: 8px; }

  .lot-depot {
    font-family: var(--font-mono, monospace);
    font-size: 10px; color: var(--text-lo, #555);
    background: var(--bg, #0d0d0d);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 3px; padding: 1px 5px;
    text-transform: uppercase; letter-spacing: 0.03em;
  }

  .lot-stock {
    font-family: var(--font-mono, monospace);
    font-size: 11px; font-weight: 700;
    color: var(--green, #4ade80);
  }

  .lot-expiry {
    flex-shrink: 0;
    display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
  }

  .exp-date {
    font-family: var(--font-mono, monospace);
    font-size: 13px; font-weight: 700;
  }

  .exp-days {
    font-family: var(--font-mono, monospace);
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.04em;
    padding: 1px 5px; border-radius: 3px;
  }

  .expiry-urgent .exp-date { color: var(--red, #f87171); }
  .expiry-urgent .exp-days { background: #2a0a0a; color: var(--red, #f87171); }

  .expiry-soon .exp-date { color: #fb923c; }
  .expiry-soon .exp-days { background: #2a1400; color: #fb923c; }

  .expiry-later .exp-date { color: var(--amber, #f5a623); }
  .expiry-later .exp-days { background: #2a1e00; color: var(--amber, #f5a623); }

  /* Splash / Empty */
  .splash, .empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 12px; padding: 60px 24px;
    color: var(--text-lo, #555);
    font-family: var(--font-mono, monospace);
    font-size: 13px; text-align: center;
  }

  .spin {
    font-size: 28px; color: var(--amber, #f5a623);
    display: inline-block;
    animation: spin 1.2s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
</style>
