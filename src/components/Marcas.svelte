<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Store, Tag, Pencil, Plus, Check, X, ChevronLeft,
    AlertCircle, Clock, Calendar, Flag, ArrowRight,
    StickyNote, PackageSearch,
  } from 'lucide-svelte';
  import StockModal from './StockModal.svelte';
  import {
    searchProducts, getStockByProduct,
    getBrandNotes, saveBrandNote, updateBrandNote, deleteBrandNote,
    getDepots,
  } from '../lib/idb';
  import type { Product } from '../lib/supabase';
  import type { BrandNote } from '../lib/idb';

  export let depotId: number = 1;

  // ── Estado ───────────────────────────────────────────────────
  type BrandRow = {
    name: string;
    productCount: number;
    lastUpdated: Date | null;
    freshnessClass: string;
    freshnessLabel: string;
    openNotes: number;
  };

  let brands: BrandRow[]   = [];
  let loading              = true;
  let selectedBrand: string | null = null;
  let brandProducts: Product[] = [];
  let brandNotes: BrandNote[]  = [];

  // Modal de stock
  let modalOpen              = false;
  let modalProduct: Product | null = null;
  let stockVersion           = 0;

  // Editor de nota
  let showNoteForm    = false;
  let editingNote: BrandNote | null = null;
  let noteContent     = '';
  let noteStatus: 'open' | 'done' = 'open';
  let notePriority: 'low' | 'normal' | 'high' = 'normal';
  let noteDueDate     = '';
  let noteIsTask      = false;
  let noteSaving      = false;
  let deleteConfirm: number | null = null;

  onMount(async () => {
    await loadBrands();
  });

  // ── Carga de marcas ──────────────────────────────────────────
  async function loadBrands() {
    loading = true;
    const all = await searchProducts('');
    const notes = await getBrandNotes();
    const now = Date.now();

    const map = new Map<string, { products: Product[]; dates: Date[] }>();
    for (const p of all) {
      if (!map.has(p.brand)) map.set(p.brand, { products: [], dates: [] });
      map.get(p.brand)!.products.push(p);
    }

    // Para cada marca, buscar la fecha más reciente de actualización de stock
    const brandList: BrandRow[] = [];
    for (const [brand, { products }] of map) {
      let maxDate: Date | null = null;
      for (const p of products) {
        const lots = await getStockByProduct(p.id);
        for (const l of lots) {
          const d = new Date(l.created_at);
          if (!maxDate || d > maxDate) maxDate = d;
        }
      }

      const openNotes = notes.filter(n => n.brand === brand && n.status === 'open').length;
      const { cls, label } = freshnessOf(maxDate, now);
      brandList.push({
        name: brand,
        productCount: products.length,
        lastUpdated: maxDate,
        freshnessClass: cls,
        freshnessLabel: label,
        openNotes,
      });
    }

    brandList.sort((a, b) => {
      // Orden: sin actualizar primero, luego por fecha más vieja
      if (!a.lastUpdated && !b.lastUpdated) return a.name.localeCompare(b.name);
      if (!a.lastUpdated) return -1;
      if (!b.lastUpdated) return 1;
      return a.lastUpdated.getTime() - b.lastUpdated.getTime();
    });

    brands = brandList;
    loading = false;
  }

  function freshnessOf(date: Date | null, now: number) {
    if (!date) return { cls: 'f-none', label: 'Sin datos' };
    const days = (now - date.getTime()) / 86400000;
    if (days < 1)  return { cls: 'f-today',  label: 'Hoy' };
    if (days < 2)  return { cls: 'f-today',  label: 'Ayer' };
    if (days < 4)  return { cls: 'f-recent', label: `${Math.floor(days)}d` };
    if (days < 8)  return { cls: 'f-old',    label: `${Math.floor(days)}d` };
    return             { cls: 'f-stale',  label: `${Math.floor(days)}d` };
  }

  // ── Ver una marca ────────────────────────────────────────────
  async function openBrand(brand: string) {
    selectedBrand = brand;
    showNoteForm  = false;
    editingNote   = null;
    await refreshBrand();
  }

  async function refreshBrand() {
    if (!selectedBrand) return;
    brandProducts = await searchProducts(selectedBrand);
    brandNotes    = await getBrandNotes(selectedBrand);
  }

  function closeBrand() {
    selectedBrand = null;
    loadBrands();
  }

  // ── Stock modal ──────────────────────────────────────────────
  function openModal(p: Product) { modalProduct = p; modalOpen = true; }
  function closeModal()          { modalOpen = false; modalProduct = null; }
  async function handleSaved()   { modalOpen = false; stockVersion++; await refreshBrand(); }

  // ── Notas ────────────────────────────────────────────────────
  function startNewNote() {
    editingNote   = null;
    noteContent   = '';
    noteStatus    = 'open';
    notePriority  = 'normal';
    noteDueDate   = '';
    noteIsTask    = false;
    showNoteForm  = true;
  }

  function startEditNote(n: BrandNote) {
    editingNote   = n;
    noteContent   = n.content;
    noteStatus    = n.status;
    notePriority  = n.priority;
    noteDueDate   = n.due_date ?? '';
    noteIsTask    = !!(n.due_date || n.priority !== 'normal' || n.status !== 'open');
    showNoteForm  = true;
  }

  async function saveNote() {
    if (!noteContent.trim() || !selectedBrand) return;
    noteSaving = true;
    try {
      if (editingNote?.id) {
        await updateBrandNote(editingNote.id, {
          content:   noteContent.trim(),
          status:    noteIsTask ? noteStatus    : 'open',
          priority:  noteIsTask ? notePriority  : 'normal',
          due_date:  noteIsTask && noteDueDate ? noteDueDate : null,
        });
      } else {
        await saveBrandNote({
          brand:    selectedBrand,
          content:  noteContent.trim(),
          status:   noteIsTask ? noteStatus    : 'open',
          priority: noteIsTask ? notePriority  : 'normal',
          due_date: noteIsTask && noteDueDate ? noteDueDate : null,
        });
      }
      showNoteForm = false;
      editingNote  = null;
      await refreshBrand();
    } finally {
      noteSaving = false;
    }
  }

  async function toggleDone(n: BrandNote) {
    if (!n.id) return;
    await updateBrandNote(n.id, { status: n.status === 'done' ? 'open' : 'done' });
    await refreshBrand();
  }

  async function handleDelete(id: number) {
    if (deleteConfirm !== id) { deleteConfirm = id; return; }
    deleteConfirm = null;
    await deleteBrandNote(id);
    await refreshBrand();
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  }

  function isOverdue(iso: string | null): boolean {
    if (!iso) return false;
    return new Date(iso) < new Date();
  }

  const PRIORITY_LABEL: Record<string, string> = { low: 'Baja', normal: 'Normal', high: 'Alta' };
  const PRIORITY_CLASS: Record<string, string> = { low: 'prio-low', normal: 'prio-normal', high: 'prio-high' };
</script>

<div class="marcas-root">

  <!-- ── Lista de marcas ──────────────────────────────────────── -->
  {#if !selectedBrand}
    <div class="header">
      <span class="header-title"><Store size={16} strokeWidth={2} /> Marcas</span>
    </div>

    {#if loading}
      <div class="empty-state">Cargando marcas...</div>
    {:else if brands.length === 0}
      <div class="empty-state"><PackageSearch size={36} strokeWidth={1.5} />Sin productos</div>
    {:else}
      <div class="brand-list">
        {#each brands as b}
          <button class="brand-row" on:click={() => openBrand(b.name)}>
            <span class="freshness-dot {b.freshnessClass}" title={b.freshnessLabel}></span>
            <span class="brand-name">{b.name}</span>
            <span class="brand-meta">
              {b.productCount} prod.
              {#if b.openNotes > 0}
                <span class="note-badge"><StickyNote size={10} strokeWidth={2} /> {b.openNotes}</span>
              {/if}
            </span>
            <span class="freshness-label {b.freshnessClass}">{b.freshnessLabel}</span>
            <ArrowRight size={14} strokeWidth={2} class="brand-arrow" />
          </button>
        {/each}
      </div>

      <!-- Leyenda de frescura -->
      <div class="legend">
        <span class="legend-item"><span class="freshness-dot f-today"></span> Hoy/Ayer</span>
        <span class="legend-item"><span class="freshness-dot f-recent"></span> 2–3 d</span>
        <span class="legend-item"><span class="freshness-dot f-old"></span> 4–7 d</span>
        <span class="legend-item"><span class="freshness-dot f-stale"></span> +7 d</span>
        <span class="legend-item"><span class="freshness-dot f-none"></span> Sin datos</span>
      </div>
    {/if}

  <!-- ── Vista de marca ─────────────────────────────────────── -->
  {:else}
    <div class="header">
      <button class="back-btn" on:click={closeBrand} aria-label="Volver">
        <ChevronLeft size={20} strokeWidth={2} />
      </button>
      <span class="header-title">{selectedBrand}</span>
      <button class="add-note-btn" on:click={startNewNote} title="Agregar nota">
        <Plus size={16} strokeWidth={2.5} />
      </button>
    </div>

    <!-- Notas de la marca -->
    {#if brandNotes.length > 0 || showNoteForm}
      <div class="notes-section">
        <p class="notes-section-label"><StickyNote size={11} strokeWidth={2} /> Notas</p>

        {#each brandNotes as note}
          <div class="note-card" class:note-done={note.status === 'done'}>
            <div class="note-top">
              <button class="note-check" on:click={() => toggleDone(note)}
                title={note.status === 'done' ? 'Marcar como pendiente' : 'Marcar como hecha'}>
                {#if note.status === 'done'}
                  <Check size={13} strokeWidth={3} />
                {:else}
                  <span class="note-check-empty"></span>
                {/if}
              </button>
              <span class="note-content">{note.content}</span>
              <div class="note-actions">
                <button class="note-btn" on:click={() => startEditNote(note)}><Pencil size={12} strokeWidth={2} /></button>
                <button
                  class="note-btn"
                  class:confirming={deleteConfirm === note.id}
                  on:click={() => handleDelete(note.id!)}
                >
                  {#if deleteConfirm === note.id}
                    <AlertCircle size={12} strokeWidth={2} />
                  {:else}
                    <X size={12} strokeWidth={2.5} />
                  {/if}
                </button>
              </div>
            </div>
            {#if note.due_date || note.priority !== 'normal'}
              <div class="note-meta">
                {#if note.priority !== 'normal'}
                  <span class="prio-badge {PRIORITY_CLASS[note.priority]}">
                    <Flag size={9} strokeWidth={2} /> {PRIORITY_LABEL[note.priority]}
                  </span>
                {/if}
                {#if note.due_date}
                  <span class="due-date" class:overdue={isOverdue(note.due_date)}>
                    <Calendar size={10} strokeWidth={2} /> {formatDate(note.due_date)}
                    {#if isOverdue(note.due_date)}<span class="overdue-label"> vencida</span>{/if}
                  </span>
                {/if}
              </div>
            {/if}
          </div>
        {/each}

        <!-- Formulario de nota -->
        {#if showNoteForm}
          <div class="note-form">
            <textarea
              class="note-textarea"
              placeholder="Escribí la nota o tarea..."
              bind:value={noteContent}
              rows={3}
            ></textarea>

            <div class="note-task-toggle">
              <button
                class="task-toggle-btn"
                class:active={noteIsTask}
                on:click={() => (noteIsTask = !noteIsTask)}
              >
                <Clock size={12} strokeWidth={2} />
                {noteIsTask ? 'Es una tarea' : 'Convertir en tarea'}
              </button>
            </div>

            {#if noteIsTask}
              <div class="task-fields">
                <div class="task-field">
                  <label class="task-label">Prioridad</label>
                  <div class="prio-selector">
                    {#each ['low', 'normal', 'high'] as p}
                      <button
                        class="prio-btn {PRIORITY_CLASS[p]}"
                        class:active={notePriority === p}
                        on:click={() => (notePriority = p as any)}
                      >{PRIORITY_LABEL[p]}</button>
                    {/each}
                  </div>
                </div>
                <div class="task-field">
                  <label class="task-label">Fecha límite</label>
                  <input class="input-field task-date" type="date" bind:value={noteDueDate} />
                </div>
                {#if editingNote}
                  <div class="task-field">
                    <label class="task-label">Estado</label>
                    <div class="prio-selector">
                      <button class="prio-btn" class:active={noteStatus === 'open'} on:click={() => (noteStatus = 'open')}>Pendiente</button>
                      <button class="prio-btn prio-done" class:active={noteStatus === 'done'} on:click={() => (noteStatus = 'done')}>Hecha</button>
                    </div>
                  </div>
                {/if}
              </div>
            {/if}

            <div class="note-form-actions">
              <button class="btn btn-ghost" on:click={() => (showNoteForm = false)}>Cancelar</button>
              <button class="btn btn-primary" on:click={saveNote} disabled={noteSaving || !noteContent.trim()}>
                {#if noteSaving}<span class="spin-sm">⟳</span>{:else}<Check size={14} strokeWidth={3} />{/if}
                {editingNote ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="notes-empty-row">
        <button class="notes-empty-btn" on:click={startNewNote}>
          <StickyNote size={14} strokeWidth={1.5} /> Agregar nota para {selectedBrand}
        </button>
      </div>
    {/if}

    <!-- Productos de la marca -->
    <div class="brand-products">
      <p class="notes-section-label"><Tag size={11} strokeWidth={2} /> {brandProducts.length} productos</p>
      {#each brandProducts as p (p.id)}
        <div class="prod-row">
          <div class="prod-info">
            <span class="prod-name">{p.description}</span>
            {#if p.weight_qty}<span class="prod-weight">{p.weight_qty}</span>{/if}
          </div>
          {#if depotId}
            <button class="prod-stock-btn" on:click={() => openModal(p)}>+ Stock</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<StockModal
  product={modalProduct}
  open={modalOpen}
  {depotId}
  on:close={closeModal}
  on:saved={handleSaved}
/>

<style>
  .marcas-root { display: flex; flex-direction: column; height: 100%; }

  .header {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 0 10px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 12px;
  }
  .header-title { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--text-hi); text-transform: uppercase; letter-spacing: 0.08em; flex: 1; display: flex; align-items: center; gap: 6px; }
  .back-btn { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-mid); display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; -webkit-tap-highlight-color: transparent; }
  .add-note-btn { width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid var(--amber-dim, #b57a1a); background: #1a1200; color: var(--amber); display: flex; align-items: center; justify-content: center; cursor: pointer; -webkit-tap-highlight-color: transparent; }

  /* Lista de marcas */
  .brand-list { display: flex; flex-direction: column; gap: 4px; }
  .brand-row {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 12px; background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 8px; cursor: pointer; text-align: left; width: 100%;
    -webkit-tap-highlight-color: transparent; transition: border-color 0.15s;
  }
  .brand-row:active { border-color: var(--amber); }
  .brand-name { flex: 1; font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--amber); text-transform: uppercase; letter-spacing: 0.04em; }
  .brand-meta { font-family: var(--font-mono); font-size: 10px; color: var(--text-lo); display: flex; align-items: center; gap: 5px; }
  .note-badge { display: flex; align-items: center; gap: 3px; color: var(--amber); font-size: 10px; }
  :global(.brand-arrow) { color: var(--text-lo); flex-shrink: 0; }

  /* Frescura */
  .freshness-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .freshness-label { font-family: var(--font-mono); font-size: 10px; font-weight: 700; }
  .f-today  { background: var(--green, #4ade80); color: var(--green, #4ade80); }
  .f-recent { background: #a3e635; color: #a3e635; }
  .f-old    { background: var(--amber, #f5a623); color: var(--amber, #f5a623); }
  .f-stale  { background: var(--red, #f87171); color: var(--red, #f87171); }
  .f-none   { background: var(--border, #2a2a2a); color: var(--text-lo, #555); }

  .legend { display: flex; gap: 12px; padding: 12px 2px; flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 10px; color: var(--text-lo); }

  /* Notas */
  .notes-section { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
  .notes-section-label { font-family: var(--font-mono); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-lo); display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
  .note-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .note-card.note-done { opacity: 0.5; }
  .note-top { display: flex; align-items: flex-start; gap: 8px; }
  .note-check { flex-shrink: 0; width: 20px; height: 20px; border-radius: 4px; border: 1.5px solid var(--border-hi); background: var(--bg); color: var(--green); display: flex; align-items: center; justify-content: center; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .note-check-empty { width: 14px; height: 14px; display: block; }
  .note-content { flex: 1; font-family: var(--font-ui); font-size: 14px; color: var(--text-hi); line-height: 1.4; }
  .note-actions { display: flex; gap: 4px; flex-shrink: 0; }
  .note-btn { width: 26px; height: 26px; border-radius: 4px; border: 1px solid var(--border); background: none; color: var(--text-lo); cursor: pointer; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; }
  .note-btn.confirming { border-color: var(--red); color: var(--red); }
  .note-meta { display: flex; gap: 8px; align-items: center; padding-left: 28px; }
  .prio-badge { display: flex; align-items: center; gap: 3px; font-family: var(--font-mono); font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px; }
  .prio-low    { background: #1a2a1a; color: #4ade80; border: 1px solid #1c3a28; }
  .prio-normal { background: #1a1a2a; color: #818cf8; border: 1px solid #1e1e3a; }
  .prio-high   { background: #2a0a0a; color: var(--red, #f87171); border: 1px solid #4a1010; }
  .prio-done   { background: #1a2a1a; color: #4ade80; }
  .due-date { display: flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-size: 10px; color: var(--text-lo); }
  .due-date.overdue { color: var(--red, #f87171); }
  .overdue-label { font-weight: 700; }

  /* Formulario nota */
  .note-form { background: var(--bg); border: 1.5px solid var(--amber-dim, #b57a1a); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  .note-textarea { width: 100%; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; color: var(--text-hi); font-family: var(--font-ui); font-size: 14px; padding: 8px 10px; resize: none; box-sizing: border-box; }
  .task-toggle-btn { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 4px; border: 1px solid var(--border-hi); background: none; color: var(--text-lo); cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .task-toggle-btn.active { border-color: var(--amber); color: var(--amber); background: #1a1200; }
  .task-fields { display: flex; flex-direction: column; gap: 8px; }
  .task-field { display: flex; flex-direction: column; gap: 4px; }
  .task-label { font-family: var(--font-mono); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-lo); }
  .task-date { height: 36px; font-size: 13px; }
  .prio-selector { display: flex; gap: 6px; }
  .prio-btn { flex: 1; height: 30px; border-radius: 4px; border: 1px solid var(--border-hi); background: var(--bg); color: var(--text-mid); font-family: var(--font-mono); font-size: 10px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: border-color 0.15s, background 0.15s; }
  .prio-btn.active.prio-low    { border-color: #4ade80; color: #4ade80; background: #0d1f0d; }
  .prio-btn.active.prio-normal { border-color: #818cf8; color: #818cf8; background: #0d0d1f; }
  .prio-btn.active.prio-high   { border-color: var(--red); color: var(--red); background: #1f0d0d; }
  .prio-btn.active.prio-done   { border-color: #4ade80; color: #4ade80; background: #0d1f0d; }
  .note-form-actions { display: flex; gap: 8px; }
  .note-form-actions .btn-ghost { flex-shrink: 0; }
  .note-form-actions .btn-primary { flex: 1; }
  .spin-sm { display: inline-block; animation: spin 1s linear infinite; }

  /* Botón notas vacío */
  .notes-empty-row { margin-bottom: 12px; }
  .notes-empty-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; border-radius: 8px; border: 1px dashed var(--border-hi); background: none; color: var(--text-lo); font-family: var(--font-mono); font-size: 11px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .notes-empty-btn:hover { border-color: var(--amber); color: var(--amber); }

  /* Productos */
  .brand-products { display: flex; flex-direction: column; gap: 4px; }
  .prod-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; }
  .prod-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .prod-name { font-family: var(--font-ui); font-size: 15px; font-weight: 600; color: var(--text-hi); }
  .prod-weight { font-family: var(--font-mono); font-size: 11px; color: var(--text-mid); }
  .prod-stock-btn { flex-shrink: 0; height: 32px; padding: 0 12px; border-radius: 5px; border: 1.5px solid var(--amber-dim, #b57a1a); background: #1a1200; color: var(--amber); font-family: var(--font-ui); font-size: 13px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }

  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 40px 20px; color: var(--text-lo); font-family: var(--font-mono); font-size: 12px; }

  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
