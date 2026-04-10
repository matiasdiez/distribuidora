<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { addStockEntry, getStockByProduct } from '../lib/idb';
  import type { Product, StockEntry } from '../lib/supabase';

  export let product: Product;
  export let depotId: number = 1;
  export let index: number   = 0;   // posición en el stack
  export let total: number   = 1;

  const dispatch = createEventDispatcher<{
    saved: { product_id: number };
  }>();

  // Stock actual
  let lots: StockEntry[] = [];
  let totalStock = 0;

  // Formulario inline
  let lotNumber = '';
  let quantity  = '';
  let notes     = '';
  let saving    = false;
  let saved     = false;
  let error     = '';
  let showForm  = false;

  // Cargar lotes al montar
  $: loadLots(product.id);

  async function loadLots(pid: number) {
    lots       = await getStockByProduct(pid);
    totalStock = lots
      .filter(l => l.depot_id === depotId)
      .reduce((s, l) => s + l.quantity, 0);
  }

  async function save() {
    error = '';
    const qty = parseInt(quantity, 10);
    if (!lotNumber.trim()) { error = 'Ingresá el nro. de lote.'; return; }
    if (isNaN(qty) || qty <= 0) { error = 'Cantidad inválida.'; return; }

    saving = true;
    try {
      await addStockEntry(
        {
          product_id: product.id,
          depot_id:   depotId,
          lot_number: lotNumber.trim().toUpperCase(),
          quantity:   qty,
          notes:      notes.trim() || null,
        },
        depotId
      );
      // Actualizar stock local
      await loadLots(product.id);
      dispatch('saved', { product_id: product.id });

      // Feedback visual y limpiar
      saved = true;
      lotNumber = '';
      quantity  = '';
      notes     = '';
      showForm  = false;
      setTimeout(() => { saved = false; }, 2000);
    } catch (e) {
      error = 'Error al guardar.';
    } finally {
      saving = false;
    }
  }

  function toggleForm() {
    showForm = !showForm;
    error    = '';
  }

  $: depotLots = lots.filter(l => l.depot_id === depotId);
  $: hasStock  = totalStock > 0;

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }
</script>

<div class="card" class:has-stock={hasStock}>
  <!-- Indicador de posición -->
  <div class="card-pos">
    <span class="pos-text">{index + 1} / {total}</span>
    {#if saved}
      <span class="pos-saved">✓ Guardado</span>
    {/if}
  </div>

  <!-- Cabecera del producto -->
  <div class="card-header">
    <span class="card-brand">{product.brand}</span>
    <div class="card-stock-badge" class:ok={hasStock} class:empty={!hasStock}>
      {hasStock ? `${totalStock} u.` : 'Sin stock'}
    </div>
  </div>

  <!-- Nombre del producto -->
  <div class="card-name">{product.description}</div>
  {#if product.weight_qty}
    <div class="card-weight">{product.weight_qty}</div>
  {/if}

  <!-- Lotes actuales -->
  {#if depotLots.length > 0}
    <div class="card-lots">
      <p class="lots-label">Lotes en depósito</p>
      <div class="lots-list">
        {#each depotLots as lot}
          <div class="lot-row">
            <span class="lot-num">{lot.lot_number}</span>
            <span class="lot-qty">{lot.quantity} u.</span>
            <span class="lot-date">{fmtDate(lot.created_at)}</span>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="card-no-lots">Sin lotes registrados</div>
  {/if}

  <!-- Formulario de stock inline -->
  {#if showForm}
    <div class="card-form">
      <div class="form-row">
        <div class="form-field">
          <label class="form-label" for="lot-{product.id}">Nro. de lote</label>
          <input
            id="lot-{product.id}"
            class="form-input"
            type="text"
            inputmode="text"
            autocomplete="off"
            autocapitalize="characters"
            placeholder="L2025-001"
            bind:value={lotNumber}
          />
        </div>
        <div class="form-field form-field--qty">
          <label class="form-label" for="qty-{product.id}">Cantidad</label>
          <input
            id="qty-{product.id}"
            class="form-input form-input--qty"
            type="number"
            inputmode="numeric"
            min="1"
            placeholder="0"
            bind:value={quantity}
          />
        </div>
      </div>

      <div class="form-field">
        <label class="form-label" for="notes-{product.id}">Notas (opcional)</label>
        <input
          id="notes-{product.id}"
          class="form-input"
          type="text"
          autocomplete="off"
          placeholder="Revisar vencimiento..."
          bind:value={notes}
        />
      </div>

      {#if error}
        <p class="form-error">{error}</p>
      {/if}

      <div class="form-actions">
        <button class="btn-cancel" on:click={toggleForm} disabled={saving}>
          Cancelar
        </button>
        <button class="btn-save" on:click={save} disabled={saving}>
          {saving ? '...' : '✓ Sumar stock'}
        </button>
      </div>
    </div>
  {:else}
    <!-- Botón para abrir el formulario -->
    <button class="add-stock-btn" on:click={toggleForm}>
      + Sumar stock
    </button>
  {/if}

  <!-- Hint de swipe -->
  <div class="swipe-hint">
    {#if index > 0}<span>← anterior</span>{:else}<span></span>{/if}
    {#if index < total - 1}<span>siguiente →</span>{:else}<span></span>{/if}
  </div>
</div>

<style>
  .card {
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 16px;
    padding: 20px 18px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    box-sizing: border-box;
    user-select: none;
    transition: border-color 0.2s;
  }

  .card.has-stock {
    border-color: #1c3a28;
  }

  /* Posición */
  .card-pos {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pos-text {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-lo, #555);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .pos-saved {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: var(--green, #4ade80);
    letter-spacing: 0.04em;
    animation: fade-in 0.2s ease;
  }

  @keyframes fade-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Header */
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .card-brand {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: var(--amber, #f5a623);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .card-stock-badge {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .card-stock-badge.ok    { background: #166534; color: #4ade80; }
  .card-stock-badge.empty { background: #2a2a2a; color: #555; }

  /* Nombre */
  .card-name {
    font-family: var(--font-ui, sans-serif);
    font-size: 24px;
    font-weight: 700;
    color: var(--text-hi, #f0f0f0);
    line-height: 1.2;
  }

  .card-weight {
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    color: var(--text-mid, #a0a0a0);
    margin-top: -6px;
  }

  /* Lotes */
  .card-lots { display: flex; flex-direction: column; gap: 6px; }

  .lots-label {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-lo, #555);
  }

  .lots-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 100px;
    overflow-y: auto;
  }

  .lot-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg, #0d0d0d);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 5px;
    padding: 7px 10px;
  }

  .lot-num  {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    color: var(--amber, #f5a623);
    flex: 1;
  }

  .lot-qty  {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    color: var(--green, #4ade80);
    font-weight: 700;
  }

  .lot-date {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-lo, #555);
  }

  .card-no-lots {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--text-lo, #555);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 10px 0;
  }

  /* Botón principal */
  .add-stock-btn {
    width: 100%;
    height: 48px;
    border-radius: 8px;
    border: 1.5px solid var(--amber-dim, #b57a1a);
    background: #1a1200;
    color: var(--amber, #f5a623);
    font-family: var(--font-ui, sans-serif);
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.03em;
    cursor: pointer;
    margin-top: auto;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s;
  }

  .add-stock-btn:active { background: #2a1e00; }

  /* Formulario */
  .card-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: auto;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 100px;
    gap: 8px;
  }

  .form-field { display: flex; flex-direction: column; gap: 4px; }

  .form-label {
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-lo, #555);
  }

  .form-input {
    width: 100%;
    height: 44px;
    background: var(--bg, #0d0d0d);
    border: 1.5px solid var(--border, #2a2a2a);
    border-radius: 6px;
    color: var(--text-hi, #f0f0f0);
    font-family: var(--font-ui, sans-serif);
    font-size: 16px;
    padding: 0 10px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  .form-input:focus { border-color: var(--amber, #f5a623); }

  .form-input--qty {
    font-family: var(--font-mono, monospace);
    font-size: 22px;
    font-weight: 700;
    text-align: center;
  }

  .form-input--qty::-webkit-inner-spin-button,
  .form-input--qty::-webkit-outer-spin-button { -webkit-appearance: none; }

  .form-error {
    font-size: 13px;
    color: var(--red, #f87171);
    background: #2a0a0a;
    border-radius: 4px;
    padding: 6px 10px;
  }

  .form-actions {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 8px;
  }

  .btn-cancel {
    height: 44px;
    border-radius: 7px;
    border: 1px solid var(--border-hi, #3a3a3a);
    background: var(--bg, #0d0d0d);
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-ui, sans-serif);
    font-size: 15px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .btn-save {
    height: 44px;
    border-radius: 7px;
    border: none;
    background: var(--amber, #f5a623);
    color: #000;
    font-family: var(--font-ui, sans-serif);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: opacity 0.15s;
  }

  .btn-save:active { opacity: 0.75; }

  /* Hint de swipe */
  .swipe-hint {
    display: flex;
    justify-content: space-between;
    padding-top: 4px;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-lo, #555);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
</style>
