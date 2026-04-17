<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ClipboardList, Check, X, Pencil, Flag, Calendar,
    AlertCircle, Filter, Store, StickyNote,
  } from 'lucide-svelte';
  import {
    getAllBrandNotes, updateBrandNote, deleteBrandNote,
  } from '../lib/idb';
  import type { BrandNote } from '../lib/idb';

  type FilterStatus = 'all' | 'open' | 'done';
  type FilterPriority = 'all' | 'low' | 'normal' | 'high';

  let notes: BrandNote[] = [];
  let loading = true;

  let filterStatus: FilterStatus   = 'open';
  let filterPriority: FilterPriority = 'all';

  let editingId: number | null = null;
  let editContent   = '';
  let editPriority: BrandNote['priority'] = 'normal';
  let editDueDate   = '';
  let editIsTask    = false;
  let editSaving    = false;
  let deleteConfirm: number | null = null;

  onMount(loadNotes);

  async function loadNotes() {
    loading = true;
    notes   = await getAllBrandNotes();
    loading = false;
  }

  $: filtered = notes.filter(n => {
    if (filterStatus !== 'all' && n.status !== filterStatus) return false;
    if (filterPriority !== 'all' && n.priority !== filterPriority) return false;
    return true;
  }).sort((a, b) => {
    // Alta prioridad primero, luego por fecha de vencimiento, luego por creación
    const pOrder = { high: 0, normal: 1, low: 2 };
    const pd = pOrder[a.priority] - pOrder[b.priority];
    if (pd !== 0) return pd;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  $: openCount = notes.filter(n => n.status === 'open').length;
  $: doneCount = notes.filter(n => n.status === 'done').length;

  async function toggleDone(n: BrandNote) {
    if (!n.id) return;
    await updateBrandNote(n.id, { status: n.status === 'done' ? 'open' : 'done' });
    await loadNotes();
  }

  async function handleDelete(id: number) {
    if (deleteConfirm !== id) { deleteConfirm = id; return; }
    deleteConfirm = null;
    await deleteBrandNote(id);
    await loadNotes();
  }

  function startEdit(n: BrandNote) {
    editingId    = n.id ?? null;
    editContent  = n.content;
    editPriority = n.priority;
    editDueDate  = n.due_date ?? '';
    editIsTask   = !!(n.due_date || n.priority !== 'normal');
  }

  function cancelEdit() { editingId = null; }

  async function saveEdit() {
    if (!editingId || !editContent.trim()) return;
    editSaving = true;
    try {
      await updateBrandNote(editingId, {
        content:  editContent.trim(),
        priority: editIsTask ? editPriority : 'normal',
        due_date: editIsTask && editDueDate ? editDueDate : null,
      });
      editingId = null;
      await loadNotes();
    } finally {
      editSaving = false;
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  function isOverdue(iso: string | null): boolean {
    if (!iso) return false;
    return new Date(iso) < new Date();
  }

  const PRIO_LABEL: Record<string, string> = { low: 'Baja', normal: 'Normal', high: 'Alta' };
  const PRIO_CLASS: Record<string, string> = { low: 'prio-low', normal: 'prio-normal', high: 'prio-high' };

  // Agrupar por marca para visualización
  $: grouped = filtered.reduce((acc, n) => {
    if (!acc[n.brand]) acc[n.brand] = [];
    acc[n.brand].push(n);
    return acc;
  }, {} as Record<string, BrandNote[]>);

  $: groupedEntries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
</script>

<div class="tareas-root">
  <div class="header">
    <span class="header-title"><ClipboardList size={16} strokeWidth={2} /> Tareas</span>
    <div class="counters">
      <span class="counter open">{openCount} pend.</span>
      <span class="counter done">{doneCount} hech.</span>
    </div>
  </div>

  <!-- Filtros -->
  <div class="filters">
    <div class="filter-group">
      {#each [['all','Todas'],['open','Pendientes'],['done','Hechas']] as [val, label]}
        <button
          class="filter-btn"
          class:active={filterStatus === val}
          on:click={() => (filterStatus = val as FilterStatus)}
        >{label}</button>
      {/each}
    </div>
    <div class="filter-group">
      <button class="filter-icon-btn" class:active={filterPriority !== 'all'} title="Filtrar por prioridad">
        <Filter size={13} strokeWidth={2} />
      </button>
      {#if filterPriority !== 'all' || true}
        {#each [['all','·'],['high','Alta'],['normal','Med'],['low','Baja']] as [val, label]}
          <button
            class="filter-prio-btn {val !== 'all' ? PRIO_CLASS[val] : ''}"
            class:active={filterPriority === val}
            on:click={() => (filterPriority = val as FilterPriority)}
          >{label}</button>
        {/each}
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="empty-state">Cargando tareas...</div>
  {:else if filtered.length === 0}
    <div class="empty-state">
      <StickyNote size={36} strokeWidth={1.5} />
      {filterStatus === 'open' ? 'Sin tareas pendientes.' : 'Sin notas.'}
    </div>
  {:else}
    <div class="task-list">
      {#each groupedEntries as [brand, brandNotes]}
        <div class="brand-group">
          <div class="brand-group-label">
            <Store size={11} strokeWidth={2} /> {brand}
          </div>

          {#each brandNotes as note}
            <div class="task-card" class:task-done={note.status === 'done'} class:task-high={note.priority === 'high' && note.status === 'open'}>

              {#if editingId === note.id}
                <!-- Formulario de edición inline -->
                <div class="edit-form">
                  <textarea class="edit-textarea" bind:value={editContent} rows={2}></textarea>
                  <div class="edit-task-row">
                    <button class="task-toggle-btn" class:active={editIsTask} on:click={() => (editIsTask = !editIsTask)}>
                      <Flag size={11} strokeWidth={2} /> {editIsTask ? 'Tarea' : 'Solo nota'}
                    </button>
                  </div>
                  {#if editIsTask}
                    <div class="edit-fields">
                      <div class="prio-selector">
                        {#each ['low','normal','high'] as p}
                          <button class="prio-btn {PRIO_CLASS[p]}" class:active={editPriority === p}
                            on:click={() => (editPriority = p as any)}>{PRIO_LABEL[p]}</button>
                        {/each}
                      </div>
                      <input class="input-field edit-date" type="date" bind:value={editDueDate} />
                    </div>
                  {/if}
                  <div class="edit-actions">
                    <button class="btn btn-ghost" on:click={cancelEdit}>Cancelar</button>
                    <button class="btn btn-primary" on:click={saveEdit} disabled={editSaving || !editContent.trim()}>
                      <Check size={13} strokeWidth={3} /> Guardar
                    </button>
                  </div>
                </div>

              {:else}
                <!-- Vista normal -->
                <div class="task-top">
                  <button class="task-check" on:click={() => toggleDone(note)}>
                    {#if note.status === 'done'}
                      <Check size={13} strokeWidth={3} />
                    {:else}
                      <span class="check-empty"></span>
                    {/if}
                  </button>
                  <span class="task-content">{note.content}</span>
                  <div class="task-actions">
                    <button class="task-btn" on:click={() => startEdit(note)}><Pencil size={11} strokeWidth={2} /></button>
                    <button
                      class="task-btn"
                      class:confirming={deleteConfirm === note.id}
                      on:click={() => handleDelete(note.id!)}
                    >
                      {#if deleteConfirm === note.id}
                        <AlertCircle size={11} strokeWidth={2} />
                      {:else}
                        <X size={11} strokeWidth={2.5} />
                      {/if}
                    </button>
                  </div>
                </div>

                {#if note.priority !== 'normal' || note.due_date}
                  <div class="task-meta">
                    {#if note.priority !== 'normal'}
                      <span class="prio-badge {PRIO_CLASS[note.priority]}">
                        <Flag size={9} strokeWidth={2} /> {PRIO_LABEL[note.priority]}
                      </span>
                    {/if}
                    {#if note.due_date}
                      <span class="due" class:overdue={isOverdue(note.due_date) && note.status === 'open'}>
                        <Calendar size={10} strokeWidth={2} /> {formatDate(note.due_date)}
                        {#if isOverdue(note.due_date) && note.status === 'open'}
                          <span class="overdue-text"> vencida</span>
                        {/if}
                      </span>
                    {/if}
                  </div>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tareas-root { display: flex; flex-direction: column; height: 100%; }

  .header { display: flex; align-items: center; gap: 10px; padding: 14px 0 10px; border-bottom: 1px solid var(--border); margin-bottom: 10px; }
  .header-title { flex: 1; font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--text-hi); text-transform: uppercase; letter-spacing: 0.08em; display: flex; align-items: center; gap: 6px; }
  .counters { display: flex; gap: 8px; }
  .counter { font-family: var(--font-mono); font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; }
  .counter.open { color: var(--amber); background: #1a1200; border: 1px solid var(--amber-dim, #b57a1a); }
  .counter.done { color: var(--text-lo); background: var(--bg-card); border: 1px solid var(--border); }

  /* Filtros */
  .filters { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
  .filter-group { display: flex; gap: 5px; flex-wrap: wrap; }
  .filter-btn { height: 28px; padding: 0 10px; border-radius: 14px; border: 1px solid var(--border-hi); background: var(--bg-card); color: var(--text-mid); font-family: var(--font-mono); font-size: 11px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: border-color 0.15s, background 0.15s; }
  .filter-btn.active { border-color: var(--amber); color: var(--amber); background: #1a1200; }
  .filter-icon-btn { height: 28px; width: 28px; border-radius: 14px; border: 1px solid var(--border-hi); background: var(--bg-card); color: var(--text-lo); display: flex; align-items: center; justify-content: center; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .filter-icon-btn.active { border-color: var(--amber); color: var(--amber); }
  .filter-prio-btn { height: 28px; padding: 0 10px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-lo); font-family: var(--font-mono); font-size: 10px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .filter-prio-btn.active.prio-low    { border-color: #4ade80; color: #4ade80; background: #0d1f0d; }
  .filter-prio-btn.active.prio-normal { border-color: #818cf8; color: #818cf8; background: #0d0d1f; }
  .filter-prio-btn.active.prio-high   { border-color: var(--red); color: var(--red); background: #1f0d0d; }

  /* Grupos y tarjetas */
  .task-list { display: flex; flex-direction: column; gap: 14px; }
  .brand-group { display: flex; flex-direction: column; gap: 4px; }
  .brand-group-label { font-family: var(--font-mono); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-lo); display: flex; align-items: center; gap: 5px; padding: 2px 2px 4px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }

  .task-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 5px; }
  .task-card.task-done { opacity: 0.45; }
  .task-card.task-high { border-color: #4a1010; }

  .task-top { display: flex; align-items: flex-start; gap: 8px; }
  .task-check { flex-shrink: 0; width: 20px; height: 20px; border-radius: 4px; border: 1.5px solid var(--border-hi); background: var(--bg); color: var(--green); display: flex; align-items: center; justify-content: center; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .check-empty { display: block; width: 14px; height: 14px; }
  .task-content { flex: 1; font-family: var(--font-ui); font-size: 14px; color: var(--text-hi); line-height: 1.4; }
  .task-actions { display: flex; gap: 4px; }
  .task-btn { width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--border); background: none; color: var(--text-lo); cursor: pointer; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; }
  .task-btn.confirming { border-color: var(--red); color: var(--red); }

  .task-meta { display: flex; gap: 8px; align-items: center; padding-left: 28px; }
  .prio-badge { display: flex; align-items: center; gap: 3px; font-family: var(--font-mono); font-size: 9px; font-weight: 700; padding: 2px 5px; border-radius: 3px; }
  .prio-low    { background: #0d1f0d; color: #4ade80; border: 1px solid #1c3a28; }
  .prio-normal { background: #0d0d1f; color: #818cf8; border: 1px solid #1e1e3a; }
  .prio-high   { background: #1f0d0d; color: var(--red, #f87171); border: 1px solid #4a1010; }
  .due { display: flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-size: 10px; color: var(--text-lo); }
  .due.overdue { color: var(--red); }
  .overdue-text { font-weight: 700; }

  /* Edición inline */
  .edit-form { display: flex; flex-direction: column; gap: 8px; }
  .edit-textarea { width: 100%; background: var(--bg); border: 1px solid var(--border-hi); border-radius: 6px; color: var(--text-hi); font-family: var(--font-ui); font-size: 14px; padding: 8px 10px; resize: none; box-sizing: border-box; }
  .edit-task-row { display: flex; }
  .task-toggle-btn { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 4px; border: 1px solid var(--border-hi); background: none; color: var(--text-lo); cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .task-toggle-btn.active { border-color: var(--amber); color: var(--amber); background: #1a1200; }
  .edit-fields { display: flex; flex-direction: column; gap: 6px; }
  .prio-selector { display: flex; gap: 6px; }
  .prio-btn { flex: 1; height: 28px; border-radius: 4px; border: 1px solid var(--border-hi); background: var(--bg); color: var(--text-mid); font-family: var(--font-mono); font-size: 10px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .prio-btn.active.prio-low    { border-color: #4ade80; color: #4ade80; background: #0d1f0d; }
  .prio-btn.active.prio-normal { border-color: #818cf8; color: #818cf8; background: #0d0d1f; }
  .prio-btn.active.prio-high   { border-color: var(--red); color: var(--red); background: #1f0d0d; }
  .edit-date { height: 34px; font-size: 12px; }
  .edit-actions { display: flex; gap: 8px; }
  .edit-actions .btn-ghost { flex-shrink: 0; }
  .edit-actions .btn-primary { flex: 1; }

  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 40px 20px; color: var(--text-lo); font-family: var(--font-mono); font-size: 12px; }
</style>
