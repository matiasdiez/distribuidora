<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Package, ClipboardList, Pencil, X, Calendar, Check, ArrowDown } from 'lucide-svelte';
  import { addStockEntry, getStockByProduct, confirmNoStock } from "../lib/idb";
  import type { Product, StockEntry } from "../lib/supabase";

  export let product: Product | null = null;
  export let open: boolean = false;
  export let depotId: number = 1;

  const dispatch = createEventDispatcher<{
    close: void;
    saved: { product_id: number };
  }>();

  // ── Formulario ───────────────────────────────────────────────
  let lotNumber  = "";
  let quantity   = "";
  let boxes      = "";
  let expiryRaw  = "";
  let notes      = "";
  let editingLot: StockEntry | null = null;

  // ── Sin número de lote ───────────────────────────────────────
  let noLot           = false;  // el producto no tiene nro. de lote
  let noLotConfirming = false;  // mostrando diálogo de confirmación

  /** Código automático para productos sin lote: SL-AAMM */
  function autoLotCode(): string {
    const now = new Date();
    const yy  = now.getFullYear().toString().slice(2);
    const mm  = String(now.getMonth() + 1).padStart(2, '0');
    return `SL-${yy}${mm}`;
  }

  function requestNoLot() {
    if (noLot) {
      // Ya activo → desactivar y volver a campo manual
      noLot     = false;
      lotNumber = '';
      expiryRaw = '';
    } else {
      noLotConfirming = true;
    }
  }

  function confirmNoLot() {
    noLot           = true;
    noLotConfirming = false;
    lotNumber       = autoLotCode();
    expiryRaw       = '';  // sin fecha de vencimiento
  }

  function cancelNoLot() {
    noLotConfirming = false;
  }

  /**
   * Modo de operación:
   *  'add' → RECEPCIÓN: el operario ingresa cuánto LLEGÓ (delta).
   *           La app suma al total existente.
   *  'set' → INVENTARIO: el operario ingresa lo que VE en el estante (absoluto).
   *           La app reemplaza el total.
   * Para lotes nuevos ambos modos son equivalentes.
   */
  let mode: 'add' | 'set' = 'add';

  // ── Estado ───────────────────────────────────────────────────
  let existingLots: StockEntry[] = [];
  let saving = false;
  let confirmingNoStock = false;
  let error = "";
  let noStockConfirmed = false;

  // ── Lotes del depósito (sin CONTROL) ────────────────────────
  $: lotsInDepot  = existingLots.filter(l => l.depot_id === depotId && l.lot_number !== "CONTROL");
  $: totalUnits   = lotsInDepot.reduce((s, l) => s + l.quantity, 0);
  $: totalBoxes   = lotsInDepot.reduce((s, l) => s + (l.boxes ?? 0), 0);
  $: hasRealStock = totalUnits > 0 || totalBoxes > 0;

  // Valores actuales del lote que se está editando
  $: currentLotUnits = editingLot?.quantity ?? 0;
  $: currentLotBoxes = editingLot?.boxes    ?? 0;

  // Preview del resultado según modo
  $: previewUnits = (() => {
    const qty = parseInt(quantity, 10) || 0;
    if (!editingLot) return qty;
    return mode === 'add' ? currentLotUnits + qty : qty;
  })();
  $: previewBoxes = (() => {
    const bxs = parseInt(boxes, 10) || 0;
    if (!editingLot) return bxs;
    return mode === 'add' ? currentLotBoxes + bxs : bxs;
  })();

  // ── Vencimiento ──────────────────────────────────────────────
  $: expiryDisplay =
    expiryRaw.length >= 2
      ? expiryRaw.slice(0, 2) + (expiryRaw.length > 2 ? "/" + expiryRaw.slice(2) : "")
      : expiryRaw;

  function expiryToISO(raw: string): string | null {
    if (raw.length !== 4) return null;
    const mm = parseInt(raw.slice(0, 2), 10);
    const yy = parseInt(raw.slice(2, 4), 10);
    if (mm < 1 || mm > 12) return null;
    const year = 2000 + yy;
    const last = new Date(year, mm, 0).getDate();
    return `${year}-${String(mm).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  }
  function handleExpiryInput(e: Event) {
    expiryRaw = (e.target as HTMLInputElement).value.replace(/\D/g, "").slice(0, 4);
  }
  function handleExpiryPicker(e: Event) {
    const iso = (e.target as HTMLInputElement).value;
    if (!iso) { expiryRaw = ""; return; }
    const [, mm] = iso.split("-");
    expiryRaw = mm + iso.slice(2, 4);
  }
  $: pickerValue = (() => { const iso = expiryToISO(expiryRaw); return iso ?? ""; })();

  // ── Ciclo de vida ────────────────────────────────────────────
  $: if (open && product) { loadLots(); resetForm(); }

  function resetForm() {
    lotNumber        = "";
    quantity         = "";
    boxes            = "";
    expiryRaw        = "";
    notes            = "";
    editingLot       = null;
    mode             = 'add';
    noLot            = false;
    noLotConfirming  = false;
    error            = "";
  }

  async function loadLots() {
    if (!product) return;
    existingLots = await getStockByProduct(product.id);
    noStockConfirmed = existingLots.some(
      l => l.depot_id === depotId && l.lot_number === "CONTROL"
    );
  }

  /** Carga el formulario con los valores del lote a editar */
  function startEditLot(lot: StockEntry) {
    editingLot = lot;
    lotNumber  = lot.lot_number;
    notes      = lot.notes ?? "";
    mode       = 'add'; // por defecto recepción (la operación más frecuente)
    // Recepción arranca en vacío: el operario ingresa cuánto llegó (delta)
    quantity   = "";
    boxes      = "";
    if (lot.expiry_date) {
      const [y, m] = lot.expiry_date.split("-");
      expiryRaw = m + y.slice(2);
    } else {
      expiryRaw = "";
    }
    error = "";
  }

  /**
   * Rellena los campos con los valores actuales del lote.
   * Se usa al cambiar a modo Inventario para que el operario
   * parta del stock real y solo corrija lo que cambió.
   */
  function fillWithCurrentLot() {
    if (!editingLot) return;
    quantity = String(editingLot.quantity);
    boxes    = String(editingLot.boxes ?? 0);
  }

  // ── Guardar ──────────────────────────────────────────────────
  async function save() {
    if (!product) return;
    error = "";

    const qty = parseInt(quantity, 10) || 0;
    const bxs = parseInt(boxes,    10) || 0;

    if (!lotNumber.trim()) {
      error = "Ingresá el número de lote."; return;
    }
    if (qty < 0 || bxs < 0) {
      error = "Los valores no pueden ser negativos."; return;
    }
    // Lote nuevo: siempre requiere al menos 1 unidad o caja.
    // Lote existente en modo recepción: sumar 0 no tiene sentido.
    // Lote existente en modo inventario: se permite 0 (el operario contó 0).
    const allowZero = !!editingLot && mode === 'set';
    if (!allowZero && qty === 0 && bxs === 0) {
      error = "Ingresá al menos 1 unidad o 1 caja."; return;
    }
    const expiryISO = expiryRaw ? expiryToISO(expiryRaw) : null;
    if (expiryRaw && !expiryISO) {
      error = "Fecha de vencimiento inválida. Usá MM/AA."; return;
    }

    saving = true;
    try {
      await addStockEntry(
        {
          product_id:  product.id,
          depot_id:    depotId,
          lot_number:  lotNumber.trim().toUpperCase(),
          quantity:    qty,
          boxes:       bxs,
          expiry_date: expiryISO,
          notes:       notes.trim() || null,
        },
        depotId,
        mode,
      );
      dispatch("saved", { product_id: product.id });
      close();
    } catch (e) {
      error = "Error al guardar. Intentá de nuevo.";
      console.error(e);
    } finally {
      saving = false;
    }
  }

  async function handleConfirmNoStock() {
    if (!product) return;
    confirmingNoStock = true;
    try {
      await confirmNoStock(product.id, depotId);
      dispatch("saved", { product_id: product.id });
      close();
    } catch (e) {
      error = "Error al confirmar. Intentá de nuevo.";
      console.error(e);
    } finally {
      confirmingNoStock = false;
    }
  }

  function close() { dispatch("close"); }
  function handleBackdrop(e: MouseEvent) { if (e.target === e.currentTarget) close(); }

  function formatExpiry(iso: string): string {
    const [y, m] = iso.split("-");
    return `${m}/${y.slice(2)}`;
  }
  function daysUntil(iso: string): number {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  }
  function formatQty(units: number, bxs: number): string {
    const parts: string[] = [];
    if (bxs > 0)            parts.push(`${bxs} caja${bxs !== 1 ? "s" : ""}`);
    if (units > 0 || !bxs)  parts.push(`${units} u.`);
    return parts.join(" + ");
  }
</script>

{#if open && product}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={handleBackdrop}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Stock" style="position:relative;">

      <!-- ── Header ──────────────────────────────────────────── -->
      <div class="modal-header">
        <div class="modal-title-wrap">
          <span class="modal-brand">{product.brand}</span>
          <span class="modal-desc">{product.description}</span>
          {#if product.weight_qty}<span class="modal-weight">{product.weight_qty}</span>{/if}
          {#if product.price}
            <span class="modal-price">
              $ {product.price.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          {/if}
        </div>
        <button class="close-btn" on:click={close} aria-label="Cerrar"><X size={14} strokeWidth={2.5} /></button>
      </div>

      <!-- ── Lotes existentes ────────────────────────────────── -->
      {#if lotsInDepot.length > 0}
        <div class="lots-section">
          <p class="section-label">
            Stock actual — {formatQty(totalUnits, totalBoxes)}
          </p>
          <div class="lots-list">
            {#each lotsInDepot as lot}
              <button
                class="lot-row"
                class:editing={editingLot?.id === lot.id}
                on:click={() => startEditLot(lot)}
                title="Tocar para actualizar este lote"
              >
                <span class="lot-number">{lot.lot_number}</span>
                <span class="lot-qty">{formatQty(lot.quantity, lot.boxes ?? 0)}</span>
                <span class="lot-date">
                  {#if lot.expiry_date}
                    <span class="lot-expiry" class:expiry-soon={daysUntil(lot.expiry_date) <= 30}>
                      vence {formatExpiry(lot.expiry_date)}
                    </span>
                  {:else}
                    {new Date(lot.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}
                  {/if}
                </span>
                <span class="lot-edit-hint"><Pencil size={11} strokeWidth={2} /></span>
              </button>
            {/each}
          </div>
        </div>
        <div class="divider"></div>
      {/if}

      <!-- ── Formulario ──────────────────────────────────────── -->
      <div class="modal-body">

        <!-- Título del formulario + botón nueva entrada -->
        <div class="form-header-row">
          <p class="section-label">
            {editingLot ? `Actualizando lote ${editingLot.lot_number}` : "Nuevo lote"}
          </p>
          {#if editingLot}
            <button class="new-entry-btn" on:click={resetForm}>+ Nuevo lote</button>
          {/if}
        </div>

        <!-- ── Selector de modo (solo para lotes existentes) ── -->
        {#if editingLot}
          <div class="mode-selector">
            <button
              class="mode-btn"
              class:active={mode === 'add'}
              on:click={() => { mode = 'add'; quantity = ""; boxes = ""; }}
            >
              <span class="mode-icon"><Package size={20} strokeWidth={1.5} /></span>
              <span class="mode-label">Recepción</span>
              <span class="mode-desc">Llegó mercadería — suma al stock</span>
            </button>
            <button
              class="mode-btn"
              class:active={mode === 'set'}
              on:click={() => { mode = 'set'; fillWithCurrentLot(); }}
            >
              <span class="mode-icon"><ClipboardList size={20} strokeWidth={1.5} /></span>
              <span class="mode-label">Inventario</span>
              <span class="mode-desc">Conteo real — reemplaza el stock</span>
            </button>
          </div>

          <!-- Stock actual del lote seleccionado -->
          <div class="current-lot-info">
            <span class="current-lot-label">
              {mode === 'add' ? 'Stock actual del lote' : 'Stock actual del lote'}
            </span>
            <span class="current-lot-value">
              {formatQty(currentLotUnits, currentLotBoxes)}
            </span>
          </div>
        {/if}

        <!-- Nro. de lote -->
        <div class="field-group">
          <div class="lot-label-row">
            <label class="field-label" for="lot-input">Nro. de lote</label>
            {#if !editingLot}
              <button
                type="button"
                class="no-lot-toggle"
                class:active={noLot}
                on:click={requestNoLot}
                title="El producto no tiene número de lote impreso"
              >
                {noLot ? '✓ Sin nro. de lote' : 'Sin nro. de lote'}
              </button>
            {/if}
          </div>
          <input
            id="lot-input"
            class="input-field"
            class:input-readonly={!!editingLot || noLot}
            class:lot-auto={noLot}
            type="text"
            inputmode="text"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="characters"
            placeholder="Ej: L2024-001"
            bind:value={lotNumber}
            readonly={!!editingLot || noLot}
          />
          {#if noLot}
            <p class="no-lot-hint">
              Código automático generado por el sistema. El vencimiento queda sin fecha.
            </p>
          {/if}
        </div>

        <!-- Vencimiento: ocultar cuando no hay lote -->
        {#if !noLot}

        <!-- Unidades + Cajas -->
        <div class="qty-row">
          <div class="field-group">
            <label class="field-label" for="qty-input">
              {#if editingLot && mode === 'add'}Unidades a sumar{:else if editingLot}Total unidades{:else}Unidades{/if}
            </label>
            <input
              id="qty-input"
              class="input-field qty-input"
              type="number"
              inputmode="numeric"
              min="0"
              placeholder="0"
              bind:value={quantity}
            />
          </div>
          <div class="field-group">
            <label class="field-label" for="boxes-input">
              {#if editingLot && mode === 'add'}Cajas a sumar{:else if editingLot}Total cajas{:else}Cajas{/if}
            </label>
            <input
              id="boxes-input"
              class="input-field qty-input"
              type="number"
              inputmode="numeric"
              min="0"
              placeholder="0"
              bind:value={boxes}
            />
          </div>
        </div>

        <!-- Preview del resultado (solo al editar) -->
        {#if editingLot && (parseInt(quantity,10) > 0 || parseInt(boxes,10) > 0)}
          <div class="preview-row" class:preview-add={mode === 'add'} class:preview-set={mode === 'set'}>
            {#if mode === 'add'}
              <span class="preview-label">Resultado</span>
              <span class="preview-formula">
                {formatQty(currentLotUnits, currentLotBoxes)}
                +
                {formatQty(parseInt(quantity,10)||0, parseInt(boxes,10)||0)}
                =
              </span>
              <span class="preview-value">{formatQty(previewUnits, previewBoxes)}</span>
            {:else}
              <span class="preview-label">Nuevo total</span>
              <span class="preview-value">{formatQty(previewUnits, previewBoxes)}</span>
              {#if previewUnits < currentLotUnits || previewBoxes < currentLotBoxes}
                <span class="preview-diff preview-down">
                  <ArrowDown size={12} strokeWidth={2.5} /> baja de {formatQty(currentLotUnits, currentLotBoxes)}
                </span>
              {:else if previewUnits > currentLotUnits || previewBoxes > currentLotBoxes}
                <span class="preview-diff preview-up">
                  ↑ sube de {formatQty(currentLotUnits, currentLotBoxes)}
                </span>
              {/if}
            {/if}
          </div>
        {/if}

        <!-- Vencimiento -->
        <div class="field-group">
          <label class="field-label" for="expiry-input">Vencimiento (MM/AA)</label>
          <div class="expiry-wrap">
            <input
              id="expiry-input"
              class="input-field expiry-input"
              type="text"
              inputmode="numeric"
              placeholder="MM/AA"
              maxlength="5"
              value={expiryDisplay}
              on:input={handleExpiryInput}
              autocomplete="off"
            />
            <label class="expiry-picker-btn" title="Elegir fecha">
              <Calendar size={18} strokeWidth={1.5} />
              <input
                type="date"
                class="expiry-picker-hidden"
                value={pickerValue}
                on:change={handleExpiryPicker}
              />
            </label>
          </div>
        </div>

        {/if}

        <!-- Notas -->
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

      <!-- ── Diálogo confirmación "sin nro. de lote" ─────────── -->
      {#if noLotConfirming}
        <div class="no-lot-overlay">
          <div class="no-lot-dialog">
            <p class="no-lot-dialog-title">¿Confirmar sin número de lote?</p>
            <p class="no-lot-dialog-body">
              Este producto no tiene número de lote ni fecha de vencimiento impresos.
              El sistema usará el código <strong>{autoLotCode()}</strong> para identificarlo.
            </p>
            <p class="no-lot-dialog-warn">
              Asegurate de haber revisado el envase antes de confirmar.
            </p>
            <div class="no-lot-dialog-actions">
              <button class="btn btn-ghost" on:click={cancelNoLot}>Cancelar</button>
              <button class="btn btn-primary" on:click={confirmNoLot}>Confirmar</button>
            </div>
          </div>
        </div>
      {/if}

      <!-- ── Footer ──────────────────────────────────────────── -->
      <div class="modal-footer">
        <button class="btn btn-ghost" on:click={close} disabled={saving || confirmingNoStock}>
          Cancelar
        </button>

        {#if !hasRealStock}
          <button
            class="btn btn-no-stock"
            class:confirmed={noStockConfirmed}
            on:click={handleConfirmNoStock}
            disabled={saving || confirmingNoStock}
            title="Confirmar que se chequeó y no hay stock"
          >
            {confirmingNoStock ? "..." : noStockConfirmed ? "✓ Sin stock" : "Sin stock"}
          </button>
        {/if}

        <button
          class="btn btn-primary save-btn"
          on:click={save}
          disabled={saving || confirmingNoStock}
        >
          {#if saving}
            Guardando...
          {:else if editingLot && mode === 'add'}
            ✓ Sumar
          {:else if editingLot}
            ✓ Actualizar
          {:else}
            ✓ Guardar
          {/if}
        </button>
      </div>

    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.75);
    z-index: 200;
    display: flex; align-items: flex-end;
  }
  .modal {
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border-hi, #3a3a3a);
    border-bottom: none;
    border-radius: 16px 16px 0 0;
    width: 100%;
    max-height: 92dvh;
    overflow-y: auto;
    display: flex; flex-direction: column;
    animation: slide-up 0.22s ease-out;
  }
  @keyframes slide-up {
    from { transform: translateY(40px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }

  /* Header */
  .modal-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 18px 16px 14px;
    border-bottom: 1px solid var(--border, #2a2a2a);
    gap: 12px;
  }
  .modal-title-wrap { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .modal-brand { font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 700; color: var(--amber, #f5a623); text-transform: uppercase; letter-spacing: 0.06em; }
  .modal-desc { font-family: var(--font-ui, sans-serif); font-size: 20px; font-weight: 700; color: var(--text-hi, #f0f0f0); line-height: 1.2; }
  .modal-weight { font-family: var(--font-mono, monospace); font-size: 12px; color: var(--text-mid, #a0a0a0); }
  .modal-price { font-family: var(--font-mono, monospace); font-size: 15px; font-weight: 700; color: var(--green, #4ade80); margin-top: 2px; }
  .close-btn { flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; background: var(--bg, #0d0d0d); border: 1px solid var(--border, #2a2a2a); color: var(--text-mid, #a0a0a0); font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; }

  /* Lotes */
  .lots-section { padding: 12px 16px; }
  .section-label { font-family: var(--font-mono, monospace); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-lo, #555); margin-bottom: 8px; }
  .lots-list { display: flex; flex-direction: column; gap: 4px; }
  .lot-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; background: var(--bg, #0d0d0d);
    border-radius: 4px; border: 1px solid var(--border, #2a2a2a);
    cursor: pointer; text-align: left; width: 100%;
    -webkit-tap-highlight-color: transparent; transition: border-color 0.15s;
  }
  .lot-row:hover, .lot-row:active { border-color: var(--amber, #f5a623); }
  .lot-row.editing { border-color: var(--amber, #f5a623); background: #2a1e00; }
  .lot-number { font-family: var(--font-mono, monospace); font-size: 13px; font-weight: 700; color: var(--amber, #f5a623); flex: 1; }
  .lot-qty { font-family: var(--font-mono, monospace); font-size: 13px; color: var(--green, #4ade80); font-weight: 700; }
  .lot-date { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--text-lo, #555); }
  .lot-expiry { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--text-lo, #555); }
  .lot-expiry.expiry-soon { color: var(--red, #f87171); font-weight: 700; }
  .lot-edit-hint { font-size: 12px; color: var(--text-lo, #444); flex-shrink: 0; }
  .divider { height: 1px; background: var(--border, #2a2a2a); }

  /* Formulario */
  .modal-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .form-header-row { display: flex; align-items: center; justify-content: space-between; }
  .new-entry-btn {
    font-family: var(--font-mono, monospace); font-size: 10px; font-weight: 700;
    padding: 4px 10px; border-radius: 4px;
    border: 1px solid var(--amber-dim, #b57a1a); background: #2a1e00;
    color: var(--amber, #f5a623); cursor: pointer; -webkit-tap-highlight-color: transparent;
  }

  /* Selector de modo */
  .mode-selector {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  }
  .mode-btn {
    display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
    padding: 10px 12px; border-radius: 8px;
    border: 1.5px solid var(--border, #2a2a2a);
    background: var(--bg, #0d0d0d);
    cursor: pointer; text-align: left;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, background 0.15s;
  }
  .mode-btn.active {
    border-color: var(--amber, #f5a623);
    background: #2a1e00;
  }
  .mode-icon { font-size: 18px; line-height: 1; }
  .mode-label {
    font-family: var(--font-mono, monospace); font-size: 12px; font-weight: 700;
    color: var(--text-hi, #f0f0f0); text-transform: uppercase; letter-spacing: 0.05em;
  }
  .mode-btn.active .mode-label { color: var(--amber, #f5a623); }
  .mode-desc {
    font-family: var(--font-ui, sans-serif); font-size: 11px; color: var(--text-lo, #555);
    line-height: 1.3;
  }

  /* Stock actual del lote */
  .current-lot-info {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; background: var(--bg, #0d0d0d);
    border-radius: 6px; border: 1px solid var(--border, #2a2a2a);
  }
  .current-lot-label { font-family: var(--font-mono, monospace); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-lo, #555); }
  .current-lot-value { font-family: var(--font-mono, monospace); font-size: 15px; font-weight: 700; color: var(--green, #4ade80); }

  /* Preview */
  .preview-row {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 8px 12px; border-radius: 6px;
    border: 1px solid var(--border, #2a2a2a);
  }
  .preview-add { border-color: #1c3a28; background: #0d1f14; }
  .preview-set { border-color: #1a2a3a; background: #0d1420; }
  .preview-label { font-family: var(--font-mono, monospace); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-lo, #555); }
  .preview-formula { font-family: var(--font-mono, monospace); font-size: 12px; color: var(--text-mid, #a0a0a0); }
  .preview-value { font-family: var(--font-mono, monospace); font-size: 16px; font-weight: 700; color: var(--green, #4ade80); margin-left: auto; }
  .preview-diff { font-family: var(--font-mono, monospace); font-size: 11px; }
  .preview-up   { color: var(--green, #4ade80); }
  .preview-down { color: var(--amber, #f5a623); }

  /* Campos */
  .field-group { display: flex; flex-direction: column; gap: 5px; }
  .field-label { font-family: var(--font-mono, monospace); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-lo, #555); }
  .input-readonly { opacity: 0.6; background: var(--bg, #0d0d0d) !important; }
  .qty-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .qty-input { font-family: var(--font-mono, monospace); font-size: 28px; font-weight: 700; text-align: center; letter-spacing: 0.05em; }
  .qty-input::-webkit-inner-spin-button, .qty-input::-webkit-outer-spin-button { -webkit-appearance: none; }
  .expiry-wrap { display: flex; align-items: center; gap: 8px; }
  .expiry-input { font-family: var(--font-mono, monospace); font-size: 22px; font-weight: 700; text-align: center; letter-spacing: 0.12em; width: 100%; }
  .expiry-picker-btn { flex-shrink: 0; width: 44px; height: 44px; border-radius: 8px; border: 1.5px solid var(--border, #2a2a2a); background: var(--bg-card, #1a1a1a); display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; position: relative; -webkit-tap-highlight-color: transparent; }
  .expiry-picker-hidden { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
  .error-msg { font-size: 14px; color: var(--red, #f87171); padding: 8px 10px; background: var(--red-dim, #7f1d1d); border-radius: 4px; }

  /* Footer */
  .modal-footer {
    display: flex; gap: 8px;
    padding: 12px 16px 20px;
    border-top: 1px solid var(--border, #2a2a2a);
  }
  .modal-footer .btn-ghost  { flex-shrink: 0; }
  .modal-footer .btn-primary { flex: 1; font-size: 16px; }

  .btn-no-stock {
    flex-shrink: 0; height: 48px; padding: 0 14px; border-radius: 8px;
    border: 1.5px solid var(--border-hi, #3a3a3a); background: var(--bg, #0d0d0d);
    color: var(--text-mid, #a0a0a0); font-family: var(--font-mono, monospace);
    font-size: 12px; font-weight: 700; letter-spacing: 0.04em;
    cursor: pointer; -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, color 0.15s;
  }
  .btn-no-stock.confirmed { border-color: var(--red, #f87171); color: var(--red, #f87171); background: #2a0a0a; }
  .btn-no-stock:not(.confirmed):hover, .btn-no-stock:not(.confirmed):active { border-color: var(--red, #f87171); color: var(--red, #f87171); }

  /* Sin número de lote */
  .lot-label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .no-lot-toggle {
    font-family: var(--font-mono, monospace); font-size: 10px; font-weight: 700;
    padding: 3px 9px; border-radius: 4px; letter-spacing: 0.04em; text-transform: uppercase;
    border: 1px solid var(--border-hi, #3a3a3a); background: none;
    color: var(--text-lo, #555); cursor: pointer;
    -webkit-tap-highlight-color: transparent; transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .no-lot-toggle.active { border-color: var(--amber, #f5a623); color: var(--amber, #f5a623); background: #2a1e00; }
  .lot-auto { color: var(--amber, #f5a623) !important; font-style: italic; letter-spacing: 0.06em; }
  .no-lot-hint { font-family: var(--font-mono, monospace); font-size: 10px; color: var(--text-lo, #555); margin-top: 2px; line-height: 1.4; }

  /* Diálogo confirmación sin lote */
  .no-lot-overlay {
    position: absolute; inset: 0; z-index: 10;
    background: rgba(0,0,0,0.75);
    display: flex; align-items: center; justify-content: center;
    padding: 20px; border-radius: 16px 16px 0 0;
  }
  .no-lot-dialog {
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--amber-dim, #b57a1a);
    border-radius: 12px;
    padding: 20px 18px;
    display: flex; flex-direction: column; gap: 10px;
    max-width: 340px; width: 100%;
  }
  .no-lot-dialog-title { font-family: var(--font-mono, monospace); font-size: 13px; font-weight: 700; color: var(--amber, #f5a623); text-transform: uppercase; letter-spacing: 0.06em; }
  .no-lot-dialog-body { font-family: var(--font-ui, sans-serif); font-size: 14px; color: var(--text-mid, #a0a0a0); line-height: 1.5; }
  .no-lot-dialog-body strong { color: var(--amber, #f5a623); font-family: var(--font-mono, monospace); }
  .no-lot-dialog-warn { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--red, #f87171); background: var(--red-dim, #7f1d1d); padding: 6px 10px; border-radius: 4px; line-height: 1.4; }
  .no-lot-dialog-actions { display: flex; gap: 8px; margin-top: 4px; }
  .no-lot-dialog-actions .btn-ghost { flex-shrink: 0; }
  .no-lot-dialog-actions .btn-primary { flex: 1; }
</style>
