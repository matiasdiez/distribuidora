<script lang="ts">
  import { getStockByProduct } from '../lib/idb';
  import type { Product } from '../lib/supabase';

  export let products: Product[] = [];
  export let depotId: number = 1;
  export let categoryLabel: string = 'Todos';

  let exporting = false;

  async function exportCSV() {
    if (products.length === 0) return;
    exporting = true;

    try {
      const rows: string[][] = [];

      // Encabezado — "Cajas" y "Unidades" separados
      rows.push([
        'Código',
        'Marca',
        'Descripción',
        'Peso / Cant.',
        'Categoría',
        'Cajas',
        'Unidades',
        'Última actualización',
      ]);

      for (const p of products) {
        const entries = await getStockByProduct(p.id);
        const allDepotEntries = entries.filter(e => e.depot_id === depotId);

        // Excluir la entrada CONTROL del cálculo de stock
        const realEntries = allDepotEntries.filter(e => e.lot_number !== 'CONTROL');
        const totalUnits = realEntries.reduce((s, e) => s + e.quantity, 0);
        const totalBoxes = realEntries.reduce((s, e) => s + (e.boxes ?? 0), 0);

        // "Última actualización": max created_at de TODOS los lotes, incluido CONTROL.
        // Así, confirmar "sin stock" también registra la fecha de chequeo.
        const lastUpdate = allDepotEntries.length > 0
          ? allDepotEntries
              .map(e => new Date(e.created_at))
              .sort((a, b) => b.getTime() - a.getTime())[0]
              .toLocaleDateString('es-AR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })
          : '—';

        rows.push([
          p.code,
          p.brand,
          p.description,
          p.weight_qty ?? '',
          p.category,
          String(totalBoxes),
          String(totalUnits),
          lastUpdate,
        ]);
      }

      const csv = rows
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);

      const date = new Date().toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
      }).replace(/\//g, '-');
      const catSlug = categoryLabel.replace(/\s+/g, '_').toLowerCase();
      const filename = `stock_${catSlug}_${date}.csv`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      exporting = false;
    }
  }
</script>

<button
  class="export-btn"
  class:disabled={products.length === 0}
  on:click={exportCSV}
  disabled={exporting || products.length === 0}
  title={products.length === 0 ? 'No hay productos para exportar' : `Exportar ${products.length} productos como CSV`}
>
  {#if exporting}
    <span class="btn-icon spin">⟳</span> Generando...
  {:else}
    <span class="btn-icon">↓</span> CSV
    {#if products.length > 0}
      <span class="count">({products.length})</span>
    {/if}
  {/if}
</button>

<style>
  .export-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 34px;
    padding: 0 13px;
    border-radius: 5px;
    border: 1.5px solid var(--border-hi, #3a3a3a);
    background: var(--bg-card, #1a1a1a);
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
    -webkit-tap-highlight-color: transparent;
    white-space: nowrap;
  }
  .export-btn:not(.disabled):hover,
  .export-btn:not(.disabled):active {
    border-color: var(--green, #4ade80);
    color: var(--green, #4ade80);
  }
  .export-btn.disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-icon { font-size: 14px; line-height: 1; }
  .count { color: var(--text-lo, #555); font-size: 10px; }
  .spin { display: inline-block; animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
