<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { addStockEntry, getStockByProduct, getDepots } from '../lib/idb';
  import type { Product, StockEntry } from '../lib/supabase';

  export let product: Product | null = null;
  export let open: boolean = false;
  export let depotId: number = 1;

  const dispatch = createEventDispatcher<{
    close:  void;
    saved: { product_id: number };
  }>();

  let lotNumber  = '';
  let quantity   = '';
  let notes      = '';
  let existingLots: StockEntry[] = [];
  let saving     = false;
  let error      = '';

  // Cargar lotes existentes cuando se abre el modal
  $: if (open && product) {
    loadLots();
    lotNumber = '';
    quantity  = '';
    notes     = '';
    error     = '';
  }

  async function loadLots() {
    if (!product) return;
    existingLots = await getStockByProduct(product.id);
  }

  async function save() {
    if (!product) return;
    error = '';

    const qty = parseInt(quantity, 10);

    if (!lotNumber.trim()) { error = 'Ingresá el número de lote.'; return; }
    if (isNaN(qty) || qty <= 0) { error = 'La cantidad debe ser mayor a 0.'; return; }

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
      dispatch('saved', { product_id: product.id });
      close();
    } catch (e) {
      error = 'Error al guardar. Intentá de nuevo.';
      console.error(e);
    } finally {
      saving = false;
    }
  }

  function close() {
    dispatch('close');
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  // Total actual de este producto en el depósito
  $: totalCurrent = existingLots
    .filter(l => l.depot_id === depotId)
    .reduce((s, l) => s + l.quantity, 0);
</script>

{#if open && product}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={handleBackdrop}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Agregar stock">

      <!-- Header del modal -->
      <div class="modal-header">
        <div class="modal-title-wrap">
          <span class="modal-brand">{product.brand}</span>
          <span class="modal-desc">{product.description}</span>
          {#if product.weight_qty}
            <span class="modal-weight">{product.weight_qty}</span>
          {/if}
        </div>
        <button class="close-btn" on:click={close} aria-label="Cerrar">✕</button>
      </div>

      <!-- Lotes existentes -->
      {#if existingLots.length > 0}
        <div class="lots-section">
          <p class="section-label">Stock actual — {totalCurrent} unidades</p>
          <div class="lots-list">
            {#each existingLots.filter(l => l.depot_id === depotId) as lot}
              <div class="lot-row">
                <span class="lot-number">{lot.lot_number}</span>
                <span class="lot-qty">{lot.quantity} u.</span>
                <span class="lot-date">{new Date(lot.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</span>
              </div>
            {/each}
          </div>
        </div>
        <div class="divider"></div>
      {/if}

      <!-- Formulario -->
      <div class="modal-body">
        <p class="section-label">Agregar entrada</p>

        <div class="field-group">
          <label class="field-label" for="lot-input">Nro. de lote</label>
          <input
            id="lot-input"
            class="input-field"
            type="text"
            inputmode="text"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="characters"
            placeholder="Ej: L2024-001"
            bind:value={lotNumber}
          />
        </div>

        <div class="field-group">
          <label class="field-label" for="qty-input">Cantidad que entra</label>
          <input
            id="qty-input"
            class="input-field qty-input"
            type="number"
            inputmode="numeric"
            min="1"
            placeholder="0"
            bind:value={quantity}
          />
        </div>

        <div class="field-group">
          <label class="field-label" for="notes-input">Notas (opcional)</label>
          <input
            id="notes-input"
            class="input-field"
            type="text"
            autocomplete="off"
            placeholder="Ej: Revisar vencimiento"
            bind:value={notes}
          />
        </div>

        {#if error}
          <p class="error-msg">{error}</p>
        {/if}
      </div>

      <!-- Acciones -->
      <div class="modal-footer">
        <button class="btn btn-ghost" on:click={close} disabled={saving}>
          Cancelar
        </button>
        <button class="btn btn-primary save-btn" on:click={save} disabled={saving}>
          {saving ? 'Guardando...' : '✓ Guardar'}
        </button>
      </div>

    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    z-index: 200;
    display: flex;
    align-items: flex-end;  /* sheet desde abajo — más natural en mobile */
    padding: 0;
  }

  .modal {
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border-hi, #3a3a3a);
    border-bottom: none;
    border-radius: 16px 16px 0 0;
    width: 100%;
    max-height: 90dvh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    animation: slide-up 0.22s ease-out;
  }

  @keyframes slide-up {
    from { transform: translateY(40px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }

  /* Header */
  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 18px 16px 14px;
    border-bottom: 1px solid var(--border, #2a2a2a);
    gap: 12px;
  }

  .modal-title-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .modal-brand {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: var(--amber, #f5a623);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .modal-desc {
    font-family: var(--font-ui, sans-serif);
    font-size: 20px;
    font-weight: 700;
    color: var(--text-hi, #f0f0f0);
    line-height: 1.2;
  }

  .modal-weight {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    color: var(--text-mid, #a0a0a0);
  }

  .close-btn {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--bg, #0d0d0d);
    border: 1px solid var(--border, #2a2a2a);
    color: var(--text-mid, #a0a0a0);
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  /* Lotes */
  .lots-section {
    padding: 12px 16px;
  }

  .section-label {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-lo, #555);
    margin-bottom: 8px;
  }

  .lots-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .lot-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: var(--bg, #0d0d0d);
    border-radius: 4px;
    border: 1px solid var(--border, #2a2a2a);
  }

  .lot-number {
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: var(--amber, #f5a623);
    flex: 1;
  }

  .lot-qty {
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    color: var(--green, #4ade80);
    font-weight: 700;
  }

  .lot-date {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--text-lo, #555);
  }

  /* Formulario */
  .modal-body {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .field-label {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-lo, #555);
  }

  .qty-input {
    font-family: var(--font-mono, monospace);
    font-size: 28px;
    font-weight: 700;
    text-align: center;
    letter-spacing: 0.05em;
  }

  /* Ocultar flechas del input number */
  .qty-input::-webkit-inner-spin-button,
  .qty-input::-webkit-outer-spin-button { -webkit-appearance: none; }

  .error-msg {
    font-size: 14px;
    color: var(--red, #f87171);
    padding: 8px 10px;
    background: var(--red-dim, #7f1d1d);
    border-radius: 4px;
  }

  /* Footer */
  .modal-footer {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 8px;
    padding: 12px 16px 20px;
    border-top: 1px solid var(--border, #2a2a2a);
  }

  .save-btn { font-size: 18px; }
</style>
