<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { PackageSearch, SearchX, PackageX, Zap } from "lucide-svelte";
  import { getStockByProduct } from "../lib/idb";
  import {
    loadThresholds,
    calcFreshness,
    type FreshnessThresholds,
  } from "../lib/freshness";
  import FreshnessDot from "./FreshnessDot.svelte";
  import SkeletonProductCard from "./SkeletonProductCard.svelte";
  import type { Product } from "../lib/supabase";

  export let products: Product[] = [];
  export let isLoading: boolean = false;
  export let depotId: number | "unassigned" | undefined = 1;
  export let query: string = "";
  export let activeDepotId: number | "unassigned" | undefined = undefined;

  $: stockDepotId = activeDepotId ?? depotId;

  const dispatch = createEventDispatcher<{
    addStock: { product: Product };
    noStock:  { product: Product };
  }>();

  // ── Paginación ────────────────────────────────────────────────
  const PAGE_SIZE = 50;
  let visibleCount = PAGE_SIZE;
  $: visibleProducts = products.slice(0, visibleCount);
  $: hasMore = products.length > visibleCount;
  function loadMore() { visibleCount = Math.min(visibleCount + PAGE_SIZE, products.length); }
  $: if (products) { visibleCount = PAGE_SIZE; }

  // ── Cache de stock y frescura ─────────────────────────────────
  type StockInfo = { units: number; boxes: number; noStockConfirmed: boolean };
  let stockCache:     Record<number, StockInfo> = {};
  let freshnessCache: Record<number, { status: string; label: string }> = {};
  let thresholds: FreshnessThresholds | null = null;

  onMount(async () => { thresholds = await loadThresholds(); });
  $: if (visibleProducts.length > 0 && thresholds) loadCaches(visibleProducts);

  async function loadCaches(list: Product[]) {
    if (depotId === "unassigned") { stockCache = {}; freshnessCache = {}; return; }
    const t   = thresholds!;
    const dId = depotId;
    const CHUNK = 20;
    for (let i = 0; i < list.length; i += CHUNK) {
      const chunk   = list.slice(i, i + CHUNK);
      const entries = await Promise.all(chunk.map(async (p) => {
        const lots = await getStockByProduct(p.id);
        const depot = dId !== undefined ? lots.filter(l => l.depot_id === dId) : lots;
        const realLots   = depot.filter(l => l.lot_number !== "CONTROL");
        const controlLot = depot.find(l   => l.lot_number === "CONTROL");
        const units = realLots.reduce((s, l) => s + l.quantity, 0);
        const boxes = realLots.reduce((s, l) => s + (l.boxes ?? 0), 0);
        const latest = depot.length > 0
          ? depot.map(l => new Date(l.created_at)).sort((a, b) => b.getTime() - a.getTime())[0]
          : null;
        const fresh = calcFreshness(latest, t);
        return [p.id, { units, boxes, noStockConfirmed: !!controlLot, fresh }] as const;
      }));
      const sc = { ...stockCache };
      const fc = { ...freshnessCache };
      for (const [id, { units, boxes, noStockConfirmed, fresh }] of entries) {
        sc[id] = { units, boxes, noStockConfirmed };
        fc[id] = { status: fresh.status, label: fresh.label };
      }
      stockCache = sc;
      freshnessCache = fc;
      if (i + CHUNK < list.length) await new Promise(r => setTimeout(r, 0));
    }
  }

  function formatStock(units: number, boxes: number): string {
    const parts: string[] = [];
    if (boxes > 0) parts.push(`${boxes} caja${boxes !== 1 ? "s" : ""}`);
    if (units > 0 || !boxes) parts.push(`${units} u.`);
    return parts.join(" + ");
  }

  function openModal(product: Product) { dispatch("addStock", { product }); }

  function highlight(text: string, q: string): string {
    if (!q || q.length < 2) return text;
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`(${esc})`, "gi"), "<mark>$1</mark>");
  }

  // ──────────────────────────────────────────────────────────────
  // Swipe gesture
  // SNAP  → revela el botón de acción (card queda "abierta")
  // READY → al soltar aquí, se auto-confirma la acción
  // MAX   → tope con rubber-band effect
  // ──────────────────────────────────────────────────────────────
  const SNAP  = 82;
  const READY = 155;
  const MAX   = 200;

  let openCardId: number | null = null;

  interface DragState {
    id:     number;
    startX: number;
    startY: number;
    locked: boolean;
    horiz:  boolean | null;
  }

  let drag: DragState | null = null;
  let liveOffset = 0;
  let confirming = new Set<number>();

  function cardOffset(id: number): number {
    const base = id === openCardId ? -SNAP : 0;
    if (drag?.id === id && !drag.locked && drag.horiz !== false) return base + liveOffset;
    return base;
  }

  // 0 = recién reveló botón · 1 = listo para confirmar
  function stretchOf(id: number): number {
    const off = Math.abs(cardOffset(id));
    if (off <= SNAP) return 0;
    return Math.min(1, (off - SNAP) / (READY - SNAP));
  }

  function isReadyToConfirm(id: number): boolean {
    return Math.abs(cardOffset(id)) >= READY * 0.88;
  }

  function onPtrDown(e: PointerEvent, id: number) {
    if (openCardId !== null && openCardId !== id) openCardId = null;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag = { id, startX: e.clientX, startY: e.clientY, locked: false, horiz: null };
    liveOffset = 0;
  }

  function onPtrMove(e: PointerEvent, id: number) {
    if (!drag || drag.id !== id || drag.locked) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (drag.horiz === null) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        drag = { ...drag, horiz: true };
      } else if (Math.abs(dy) > 10) {
        drag = { ...drag, locked: true };
        return;
      } else return;
    }

    e.preventDefault();

    const base = openCardId === id ? -SNAP : 0;
    const raw  = base + dx;

    if (raw > 0) {
      // Swipe derecha → bounce elástico, no snap (acción futura)
      liveOffset = Math.min(36, 36 * (1 - Math.exp(-dx / 55))) - base;
    } else if (raw < -MAX) {
      // Rubber-band al superar el límite
      const excess = -raw - MAX;
      liveOffset = -(MAX + excess * 0.18) - base;
    } else {
      liveOffset = dx;
    }
  }

  function onPtrUp(e: PointerEvent, id: number) {
    if (!drag || drag.id !== id) return;
    const off = cardOffset(id);

    if (drag.horiz && !drag.locked) {
      if (off <= -(READY * 0.88)) {
        doConfirm(id);
        drag = null; liveOffset = 0;
        return;
      } else if (off < -(SNAP / 2)) {
        openCardId = id;
      } else {
        if (openCardId === id) openCardId = null;
      }
    }
    drag = null;
    liveOffset = 0;
  }

  function doConfirm(id: number) {
    confirming = new Set([...confirming, id]);
    drag = null; liveOffset = 0; openCardId = null;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(55);
    const product = products.find(p => p.id === id);
    if (product) {
      setTimeout(() => {
        dispatch("noStock", { product });
        confirming = new Set([...confirming].filter(x => x !== id));
        if (thresholds) loadCaches([product]);
      }, 290);
    }
  }

  function handleCardClick(product: Product) {
    // Si el card está abierto, cerrarlo en lugar de abrir modal
    if (openCardId === product.id) { openCardId = null; return; }
  }
</script>

<div class="results">

  {#if isLoading}
    <div class="results-header"><span class="results-count">Buscando…</span></div>
    <div class="product-list"><SkeletonProductCard count={7} /></div>

  {:else if products.length === 0 && query.length > 0}
    <div class="empty-state">
      <span class="empty-icon"><SearchX size={30} strokeWidth={1.5} /></span>
      <span>Sin resultados para <strong>"{query}"</strong></span>
    </div>

  {:else if products.length === 0}
    <div class="empty-state">
      <span class="empty-icon"><PackageSearch size={30} strokeWidth={1.5} /></span>
      <span>Escribí para buscar productos</span>
    </div>

  {:else}
    <div class="results-header">
      <span class="results-count">
        {products.length} resultado{products.length !== 1 ? "s" : ""}
        {#if hasMore}<span class="results-shown"> — mostrando {visibleCount}</span>{/if}
      </span>
    </div>

    <div class="product-list">
      {#each visibleProducts as product (product.id)}

        {@const si    = stockCache[product.id] ?? { units: 0, boxes: 0, noStockConfirmed: false }}
        {@const hasSt = depotId !== "unassigned" && depotId !== undefined && (si.units > 0 || si.boxes > 0)}
        {@const fresh = freshnessCache[product.id]}

        {@const isConf = confirming.has(product.id)}
        {@const offX   = isConf ? -600 : cardOffset(product.id)}
        {@const s      = stretchOf(product.id)}
        {@const rdy    = isReadyToConfirm(product.id)}
        {@const isDrag = drag?.id === product.id && drag.horiz === true && !drag.locked}

        <div class="swipe-row">

          <!-- Panel: swipe DERECHA → acción futura (izquierda del card) -->
          <div class="action-panel action-future"
               style="opacity:{Math.min(1, Math.max(0, offX / 36))}">
            <Zap size={20} strokeWidth={2} />
            <span class="act-label">Próximo</span>
          </div>

          <!-- Panel: swipe IZQUIERDA → Sin stock (derecha del card) -->
          <div class="action-panel action-nostock"
               class:action-ready={rdy}
               style="
                 background: hsl(0,{44 + s*36}%,{7 + s*14}%);
                 opacity: {Math.min(1, Math.max(0, -offX / (SNAP * 0.6)))};
               ">
            <span class="act-icon" style="transform:scale({1 + s * 0.55}) scaleX({1 + s * 0.22})">
              <PackageX size={21} strokeWidth={2} />
            </span>
            <span class="act-label" class:act-label-ready={rdy}>
              {rdy ? "¡Soltar!" : "Sin stock"}
            </span>
          </div>

          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="product-card"
            class:has-stock={hasSt}
            style="transform:translateX({offX}px);transition:{isDrag?'none':isConf?'transform 0.2s ease-in':'transform 0.27s cubic-bezier(0.34,1.45,0.64,1)'};"
            on:pointerdown={(e) => onPtrDown(e, product.id)}
            on:pointermove={(e) => onPtrMove(e, product.id)}
            on:pointerup={(e)   => onPtrUp(e, product.id)}
            on:click={() => handleCardClick(product)}
          >
            <div class="status-bar" class:stock-ok={hasSt} class:stock-no={!hasSt}></div>

            <div class="product-body">
              <div class="product-top">
                <div class="product-meta">
                  <span class="product-brand">{@html highlight(product.brand, query)}</span>
                  <span class="product-code">{product.code}</span>
                </div>
                <div class="stock-indicator">
                  {#if depotId === undefined}
                    <span class="badge badge-gray">Catálogo</span>
                  {:else if depotId === "unassigned"}
                    <span class="badge badge-gray">Sin asignar</span>
                  {:else if hasSt}
                    <span class="badge badge-green">{formatStock(si.units, si.boxes)}</span>
                  {:else if si.noStockConfirmed}
                    <span class="badge badge-red">Sin stock</span>
                  {:else}
                    <span class="badge badge-gray badge-unchecked">Sin stock</span>
                  {/if}
                  {#if fresh && depotId !== "unassigned" && depotId !== undefined}
                    <FreshnessDot status={fresh.status} label={fresh.label} size="sm" />
                  {/if}
                </div>
              </div>

              <div class="product-desc">
                <span class="product-name">{@html highlight(product.description, query)}</span>
                {#if product.weight_qty}
                  <span class="product-weight">{product.weight_qty}</span>
                {/if}
              </div>

              <div class="product-bottom">
                <span class="badge-cat">{product.category}</span>
                {#if typeof stockDepotId === "number"}
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <button
                    class="add-btn"
                    on:click|stopPropagation={() => openModal(product)}
                    aria-label="Actualizar stock de {product.brand} {product.description}"
                  >+ Stock</button>
                {/if}
              </div>
            </div>
          </div><!-- /product-card -->

        </div><!-- /swipe-row -->
      {/each}
    </div>

    {#if hasMore}
      <div class="load-more-wrap">
        <button class="load-more-btn" on:click={loadMore}>
          Ver más ({products.length - visibleCount} restantes)
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .results { display: flex; flex-direction: column; }

  .results-header { padding: 4px 2px 10px; }
  .results-count {
    font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-lo, #555);
  }
  .results-shown { font-weight: 400; }

  /* ── Lista sin gaps — divisores por border-bottom ─────────────── */
  .product-list {
    display: flex; flex-direction: column;
    user-select: none; -webkit-user-select: none;
    border-top: 1px solid var(--border, #2a2a2a);
  }

  /* ── Swipe row ───────────────────────────────────────────────── */
  .swipe-row {
    position: relative; overflow: hidden;
    border-bottom: 1px solid var(--border, #2a2a2a);
  }

  /* ── Panels de acción ────────────────────────────────────────── */
  .action-panel {
    position: absolute; top: 0; bottom: 0; width: 92px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 4px;
    pointer-events: none;
  }
  .action-future {
    left: 0; background: var(--bg-input, #071525); color: var(--blue, #38bdf8);
  }
  .action-nostock {
    right: 0; color: #fca5a5;
    transition: background 0.06s linear;
  }
  .action-nostock.action-ready { color: #fff; }

  .act-icon {
    display: flex; align-items: center; justify-content: center;
    will-change: transform;
    transition: none;
  }
  .act-label {
    font-family: var(--font-mono, monospace);
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .act-label-ready {
    animation: lbl-pulse 0.3s ease-in-out infinite alternate;
  }
  @keyframes lbl-pulse {
    from { opacity: 0.65; } to { opacity: 1; }
  }

  /* ── Card ────────────────────────────────────────────────────── */
  .product-card {
    display: flex;
    background: var(--bg-card, #1a1a1a);
    position: relative; z-index: 1;
    will-change: transform;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    touch-action: pan-y; /* permite scroll vertical, no horizontal */
  }

  .status-bar { width: 4px; flex-shrink: 0; }
  .stock-ok   { background: var(--green, #4ade80); }
  .stock-no   { background: var(--border, #2a2a2a); }

  /* ── Body ────────────────────────────────────────────────────── */
  .product-body {
    flex: 1; min-width: 0;
    padding: 12px 14px 11px;
    display: flex; flex-direction: column; gap: 5px;
  }
  .product-top {
    display: flex; align-items: flex-start;
    justify-content: space-between; gap: 10px;
  }
  .product-meta {
    display: flex; align-items: center; gap: 8px; min-width: 0;
  }
  .product-brand {
    font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 700;
    color: var(--amber, #f5a623); text-transform: uppercase;
    letter-spacing: 0.06em; white-space: nowrap;
  }
  .product-code {
    font-family: var(--font-mono, monospace); font-size: 10px;
    color: var(--text-lo, #555); white-space: nowrap;
  }
  .stock-indicator { flex-shrink: 0; display: flex; align-items: center; gap: 6px; }

  .product-desc {
    display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  }
  .product-name {
    font-family: var(--font-ui, sans-serif); font-size: 19px; font-weight: 600;
    color: var(--text-hi, #f0f0f0); line-height: 1.2;
  }
  .product-weight {
    font-family: var(--font-mono, monospace); font-size: 12px;
    color: var(--text-mid, #a0a0a0); white-space: nowrap;
  }
  .product-bottom {
    display: flex; align-items: center; justify-content: space-between; margin-top: 2px;
  }

  /* ── Badges ──────────────────────────────────────────────────── */
  .badge {
    display: inline-flex; align-items: center;
    font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 700;
    padding: 2px 8px; border-radius: 4px;
    text-transform: uppercase; letter-spacing: 0.04em;
    border: 1px solid transparent;
  }
  .badge-green {
    background: var(--green-dim, #166534); color: var(--green, #4ade80);
    border-color: rgba(74,222,128,0.2);
  }
  .badge-red {
    background: var(--red-dim, #7f1d1d); color: var(--red, #f87171);
    border-color: rgba(248,113,113,0.2);
  }
  .badge-gray {
    background: transparent; color: var(--text-lo, #555); border-color: var(--border, #2a2a2a);
  }
  .badge-unchecked { opacity: 0.55; font-style: italic; }
  .badge-cat {
    font-family: var(--font-mono, monospace); font-size: 10px;
    color: var(--text-lo, #555); letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  /* ── Botón + Stock ───────────────────────────────────────────── */
  .add-btn {
    height: 34px; padding: 0 14px; border-radius: 5px;
    border: 1.5px solid var(--amber-dim, #b57a1a);
    background: var(--amber-bg, #1a1200); color: var(--amber, #f5a623);
    font-family: var(--font-ui, sans-serif); font-size: 14px; font-weight: 700;
    letter-spacing: 0.03em; cursor: pointer;
    -webkit-tap-highlight-color: transparent; transition: background 0.12s;
  }
  .add-btn:active { background: var(--amber-bg, #2a1e00); }

  :global(mark) {
    background: var(--amber-bg, #2a1e00); color: var(--amber, #f5a623); border-radius: 2px; padding: 0 1px;
  }

  /* ── Ver más ─────────────────────────────────────────────────── */
  .load-more-wrap { padding: 16px 0 8px; display: flex; justify-content: center; }
  .load-more-btn {
    height: 40px; padding: 0 24px; border-radius: 20px;
    border: 1.5px solid var(--border-hi, #3a3a3a); background: var(--bg-card, #1a1a1a);
    color: var(--text-mid, #a0a0a0); font-family: var(--font-mono, monospace);
    font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
    cursor: pointer; -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, color 0.15s;
  }
  .load-more-btn:active { border-color: var(--amber); color: var(--amber); }

  /* ── Vacío ───────────────────────────────────────────────────── */
  .empty-state {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 10px; padding: 52px 24px;
    color: var(--text-lo); font-size: 16px; text-align: center;
  }
  .empty-icon { opacity: 0.4; }

  /* ── Light mode ──────────────────────────────────────────────── */
  :global([data-theme="light"]) .product-card { background: var(--bg-card); }
  :global([data-theme="light"]) .add-btn { background: var(--bg-input); }
</style>
