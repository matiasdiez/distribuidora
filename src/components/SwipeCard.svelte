<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { addStockEntry, getStockByProduct } from "../lib/idb";
  import type { Product, StockEntry } from "../lib/supabase";

  export let product: Product;
  export let depotId: number = 1;
  export let index: number = 0;
  export let total: number = 1;

  const dispatch = createEventDispatcher<{
    saved: { product_id: number };
  }>();

  // ── Stock actual ──────────────────────────────────────────────
  let lots: StockEntry[] = [];
  let totalUnits = 0;
  let totalBoxes = 0;

  $: loadLots(product.id);

  async function loadLots(pid: number) {
    lots = await getStockByProduct(pid);
    const depot = lots.filter((l) => l.depot_id === depotId);
    totalUnits = depot.reduce((s, l) => s + l.quantity, 0);
    totalBoxes = depot.reduce((s, l) => s + (l.boxes ?? 0), 0);
  }

  $: depotLots = lots.filter((l) => l.depot_id === depotId);
  $: hasStock = totalUnits > 0 || totalBoxes > 0;

  function formatStock(units: number, bxs: number): string {
    const parts: string[] = [];
    if (bxs > 0) parts.push(`${bxs} caja${bxs !== 1 ? "s" : ""}`);
    if (units > 0 || !bxs) parts.push(`${units} u.`);
    return parts.join(" + ");
  }

  // ── Formulario inline ─────────────────────────────────────────
  let lotNumber = "";
  let quantity = "";
  let boxes = "";
  let expiryRaw = ""; // 4 dígitos MMAA
  let notes = "";
  let saving = false;
  let saved = false;
  let error = "";
  let showForm = false;

  // MM/AA display
  $: expiryDisplay =
    expiryRaw.length >= 2
      ? expiryRaw.slice(0, 2) +
        (expiryRaw.length > 2 ? "/" + expiryRaw.slice(2) : "")
      : expiryRaw;

  // MMAA → "20YY-MM-DD" (último día del mes)
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
    expiryRaw = (e.target as HTMLInputElement).value
      .replace(/\D/g, "")
      .slice(0, 4);
  }

  function handleExpiryPicker(e: Event) {
    const iso = (e.target as HTMLInputElement).value;
    if (!iso) {
      expiryRaw = "";
      return;
    }
    const mm = iso.slice(5, 7);
    const yy = iso.slice(2, 4);
    expiryRaw = mm + yy;
  }

  $: pickerValue = expiryToISO(expiryRaw) ?? "";

  // Helpers para mostrar vencimiento en lotes existentes
  function formatExpiry(iso: string): string {
    const [y, m] = iso.split("-");
    return `${m}/${y.slice(2)}`;
  }

  function daysUntil(iso: string): number {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  }

  async function save() {
    error = "";
    const qty = parseInt(quantity, 10) || 0;
    const bxs = parseInt(boxes, 10) || 0;

    if (!lotNumber.trim()) {
      error = "Ingresá el nro. de lote.";
      return;
    }
    if (qty < 0) {
      error = "Unidades no pueden ser negativas.";
      return;
    }
    if (bxs < 0) {
      error = "Cajas no pueden ser negativas.";
      return;
    }
    if (qty === 0 && bxs === 0) {
      error = "Ingresá al menos 1 unidad o 1 caja.";
      return;
    }

    const expiryISO = expiryRaw ? expiryToISO(expiryRaw) : null;
    if (expiryRaw && !expiryISO) {
      error = "Vencimiento inválido. Usá el formato MM/AA.";
      return;
    }

    saving = true;
    try {
      await addStockEntry(
        {
          product_id: product.id,
          depot_id: depotId,
          lot_number: lotNumber.trim().toUpperCase(),
          quantity: qty,
          boxes: bxs,
          expiry_date: expiryISO,
          notes: notes.trim() || null,
        },
        depotId,
      );
      await loadLots(product.id);
      dispatch("saved", { product_id: product.id });

      saved = true;
      lotNumber = "";
      quantity = "";
      boxes = "";
      expiryRaw = "";
      notes = "";
      showForm = false;
      setTimeout(() => {
        saved = false;
      }, 2000);
    } catch (e) {
      error = "Error al guardar.";
    } finally {
      saving = false;
    }
  }

  function toggleForm() {
    showForm = !showForm;
    error = "";
    if (!showForm) {
      lotNumber = "";
      quantity = "";
      boxes = "";
      expiryRaw = "";
      notes = "";
    }
  }
</script>

<div class="card" class:has-stock={hasStock}>
  <!-- Posición + feedback guardado -->
  <div class="card-pos">
    <span class="pos-text">{index + 1} / {total}</span>
    {#if saved}
      <span class="pos-saved">✓ Guardado</span>
    {/if}
  </div>

  <!-- Cabecera: marca + badge stock -->
  <div class="card-header">
    <span class="card-brand">{product.brand}</span>
    <div class="card-stock-badge" class:ok={hasStock} class:empty={!hasStock}>
      {hasStock ? formatStock(totalUnits, totalBoxes) : "Sin stock"}
    </div>
  </div>

  <!-- Nombre + peso -->
  <div class="card-name">{product.description}</div>
  {#if product.weight_qty}
    <div class="card-weight">{product.weight_qty}</div>
  {/if}

  <!-- Precio -->
  {#if product.price}
    <div class="card-price">
      $ {product.price.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
    </div>
  {/if}

  <!-- Lotes actuales -->
  {#if depotLots.length > 0}
    <div class="card-lots">
      <p class="lots-label">Lotes en depósito</p>
      <div class="lots-list">
        {#each depotLots as lot}
          {@const days = lot.expiry_date ? daysUntil(lot.expiry_date) : null}
          <div class="lot-row">
            <span class="lot-num">{lot.lot_number}</span>
            <span class="lot-qty">
              {#if (lot.boxes ?? 0) > 0}
                {lot.boxes} caja{lot.boxes !== 1 ? "s" : ""}
                {#if lot.quantity > 0}
                  + {lot.quantity} u.{/if}
              {:else}
                {lot.quantity} u.
              {/if}
            </span>
            <span
              class="lot-expiry"
              class:expiry-soon={days !== null && days <= 30}
              class:expiry-urgent={days !== null && days <= 7}
            >
              {#if lot.expiry_date}
                vence {formatExpiry(lot.expiry_date)}
              {:else}
                {new Date(lot.created_at).toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              {/if}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="card-no-lots">Sin lotes registrados</div>
  {/if}

  <!-- Formulario inline -->
  {#if showForm}
    <div class="card-form">
      <!-- Nro. de lote -->
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

      <!-- Unidades + Cajas -->
      <div class="form-row">
        <div class="form-field">
          <label class="form-label" for="qty-{product.id}">Unidades</label>
          <input
            id="qty-{product.id}"
            class="form-input form-input--qty"
            type="number"
            inputmode="numeric"
            min="0"
            placeholder="0"
            bind:value={quantity}
          />
        </div>
        <div class="form-field">
          <label class="form-label" for="boxes-{product.id}">Cajas</label>
          <input
            id="boxes-{product.id}"
            class="form-input form-input--qty"
            type="number"
            inputmode="numeric"
            min="0"
            placeholder="0"
            bind:value={boxes}
          />
        </div>
      </div>

      <!-- Vencimiento MM/AA -->
      <div class="form-field">
        <label class="form-label" for="expiry-{product.id}"
          >Vencimiento (MM/AA)</label
        >
        <div class="expiry-wrap">
          <input
            id="expiry-{product.id}"
            class="form-input form-input--expiry"
            type="text"
            inputmode="numeric"
            placeholder="MM/AA"
            maxlength="5"
            value={expiryDisplay}
            on:input={handleExpiryInput}
            autocomplete="off"
          />
          <label class="expiry-picker-btn" title="Elegir fecha">
            📅
            <input
              type="date"
              class="expiry-picker-hidden"
              value={pickerValue}
              on:change={handleExpiryPicker}
            />
          </label>
        </div>
      </div>

      <!-- Notas -->
      <div class="form-field">
        <label class="form-label" for="notes-{product.id}"
          >Notas (opcional)</label
        >
        <input
          id="notes-{product.id}"
          class="form-input"
          type="text"
          autocomplete="off"
          placeholder="Observaciones..."
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
          {saving ? "..." : "✓ Sumar stock"}
        </button>
      </div>
    </div>
  {:else}
    <button class="add-stock-btn" on:click={toggleForm}> + Sumar stock </button>
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
    animation: fade-in 0.2s ease;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
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
    font-size: 11px;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .card-stock-badge.ok {
    background: #166534;
    color: #4ade80;
  }
  .card-stock-badge.empty {
    background: #2a2a2a;
    color: #555;
  }

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

  /* Precio */
  .card-price {
    font-family: var(--font-mono, monospace);
    font-size: 15px;
    font-weight: 700;
    color: var(--green, #4ade80);
    margin-top: -4px;
  }

  /* Lotes */
  .card-lots {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

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
    max-height: 110px;
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

  .lot-num {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    color: var(--amber, #f5a623);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lot-qty {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--green, #4ade80);
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .lot-expiry {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-lo, #555);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .lot-expiry.expiry-soon {
    color: var(--amber, #f5a623);
    font-weight: 700;
  }
  .lot-expiry.expiry-urgent {
    color: var(--red, #f87171);
    font-weight: 700;
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
    cursor: pointer;
    margin-top: auto;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s;
  }

  .add-stock-btn:active {
    background: #2a1e00;
  }

  /* Formulario */
  .card-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: auto;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

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

  .form-input:focus {
    border-color: var(--amber, #f5a623);
  }

  .form-input--qty {
    font-family: var(--font-mono, monospace);
    font-size: 22px;
    font-weight: 700;
    text-align: center;
  }

  .form-input--qty::-webkit-inner-spin-button,
  .form-input--qty::-webkit-outer-spin-button {
    -webkit-appearance: none;
  }

  /* Vencimiento */
  .expiry-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .form-input--expiry {
    font-family: var(--font-mono, monospace);
    font-size: 20px;
    font-weight: 700;
    text-align: center;
    letter-spacing: 0.1em;
    flex: 1;
  }

  .expiry-picker-btn {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    border-radius: 6px;
    border: 1.5px solid var(--border, #2a2a2a);
    background: var(--bg, #0d0d0d);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    cursor: pointer;
    position: relative;
    -webkit-tap-highlight-color: transparent;
  }

  .expiry-picker-hidden {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }

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

  .btn-save:active {
    opacity: 0.75;
  }

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
