<script lang="ts">
  import { Hexagon, Settings, X, Check, ChevronRight, Loader2, Download, RefreshCw, AlertTriangle, ExternalLink, Trash2 } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';
  import ExportCSV  from './ExportCSV.svelte';
  import { theme, toggleTheme } from '../lib/themeStore';
  import { setActiveDepot, getAutoEnter, setAutoEnter } from '../lib/depotStore';
  import { saveDepots, getDeadLetters, clearDeadLetters, deleteDeadLetter } from '../lib/idb';
  import type { DeadLetter } from '../lib/idb';
  import { createDepot } from '../lib/supabase';
  import type { Product, Depot } from '../lib/supabase';

  export let open      = false;
  export let products: Product[]  = [];
  export let depotId: number      = 1;
  export let categoryLabel        = 'Todos';
  export let depots: Depot[]      = [];
  export let activeDepot: Depot | null = null;

  const dispatch = createEventDispatcher<{
    close:         void;
    depotSelected: Depot;
    depotsUpdated: Depot[];
    forceSync:     void;
  }>();

  // ── Dead letters ─────────────────────────────────────────────
  let deadLetters: DeadLetter[] = [];
  let dlExpanded                = false;

  async function loadDeadLetters() {
    deadLetters = await getDeadLetters();
  }

  async function dismissDeadLetter(id: number) {
    await deleteDeadLetter(id);
    deadLetters = deadLetters.filter(d => d.id !== id);
  }

  async function clearAllDeadLetters() {
    await clearDeadLetters();
    deadLetters = [];
  }

  $: if (open) loadDeadLetters();

  // ── Sync forzado ─────────────────────────────────────────────
  let syncing     = false;
  let syncResult: 'idle' | 'ok' | 'error' = 'idle';
  let syncMessage = '';

  async function handleForceSync() {
    syncing     = true;
    syncResult  = 'idle';
    syncMessage = 'Subiendo cambios locales...';
    try {
      const { syncPending, initialSync } = await import('../lib/sync');
      await syncPending();
      syncMessage = 'Descargando base de datos...';
      await initialSync(1, true);
      syncResult  = 'ok';
      syncMessage = 'Base de datos actualizada ✓';
      dispatch('forceSync');
      setTimeout(() => { syncResult = 'idle'; syncMessage = ''; }, 3000);
    } catch (e) {
      syncResult  = 'error';
      syncMessage = 'Error al sincronizar. Verificá la conexión.';
      console.error('[forceSync]', e);
    } finally {
      syncing = false;
    }
  }

  // ── Preferencia auto-enter ───────────────────────────────────
  let autoEnter = getAutoEnter();

  function toggleAutoEnter() {
    autoEnter = !autoEnter;
    setAutoEnter(autoEnter);
  }

  // ── Crear depósito ────────────────────────────────────────────
  let showNewDepot  = false;
  let newDepotName  = '';
  let creatingDepot = false;
  let createError   = '';

  function toggleNewDepot() {
    showNewDepot = !showNewDepot;
    newDepotName = '';
    createError  = '';
  }

  async function handleCreateDepot() {
    createError = '';
    const name  = newDepotName.trim();
    if (!name)                      { createError = 'Escribí un nombre para el depósito.'; return; }
    if (name.length > 60)           { createError = 'El nombre es demasiado largo.'; return; }
    if (depots.some(d => d.name.toLowerCase() === name.toLowerCase())) {
      createError = 'Ya existe un depósito con ese nombre.'; return;
    }

    creatingDepot = true;
    try {
      // Intentar crear en Supabase
      const newDepot = await createDepot(name);
      depots = [...depots, newDepot];
      await saveDepots(depots);
      dispatch('depotsUpdated', depots);
      chooseDepot(newDepot);
      showNewDepot = false;
      newDepotName = '';
    } catch (e: any) {
      console.error('Supabase Error (createDepot):', e);

      if (e?.message?.includes('unique') || e?.code === '23505') {
        createError = 'Ya existe un depósito con ese nombre.';
        creatingDepot = false;
        return;
      }

      // Fallback offline-first: crear localmente con ID temporal negativo
      // y encolar para sync cuando haya permisos/conectividad
      try {
        const tempId = -(Date.now());
        const localDepot: Depot = { id: tempId, name };
        depots = [...depots, localDepot];
        await saveDepots(depots);

        const { getDB } = await import('../lib/idb');
        const db = await getDB();
        await db.add('pending_sync', {
          type: 'depot_create',
          payload: { name, temp_id: tempId },
          created_at: new Date().toISOString(),
        } as any);

        dispatch('depotsUpdated', depots);
        chooseDepot(localDepot);
        showNewDepot = false;
        newDepotName = '';

        // Mostrar aviso si parece un problema de permisos RLS
        const isRLS = e?.code === '42501' || e?.status === 403
          || String(e?.message ?? '').toLowerCase().includes('polic')
          || String(e?.message ?? '').toLowerCase().includes('violat');
        if (isRLS) {
          createError = 'WARN Depósito creado solo localmente. Para sincronizar con el servidor activá el permiso INSERT en la tabla "depots" de Supabase (RLS).';
        }
      } catch (localErr) {
        console.error('Local depot creation also failed:', localErr);
        createError = `Error al crear: ${e?.message ?? 'desconocido'}. Revisá la consola.`;
      }
    } finally {
      creatingDepot = false;
    }
  }

  function close() { dispatch('close'); }

  function chooseDepot(d: Depot) {
    setActiveDepot(d);
    dispatch('depotSelected', d);
    close();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={handleBackdrop}>
    <div class="sheet" role="dialog" aria-label="Ajustes">

      <div class="sheet-handle"></div>

      <div class="sheet-header">
        <span class="sheet-title">Ajustes</span>
        <button class="close-btn" on:click={close} aria-label="Cerrar"><X size={14} strokeWidth={2.5} /></button>
      </div>

      <!-- Sección: Depósito activo -->
      <section class="section">
        <p class="section-label">Depósito activo</p>
        <div class="depot-list">
          {#each depots as d}
            <button
              class="depot-row"
              class:active={d.id === activeDepot?.id}
              on:click={() => chooseDepot(d)}
            >
              <span class="depot-icon"><Hexagon size={16} strokeWidth={2} /></span>
              <span class="depot-name">{d.name}</span>
              {#if d.id === activeDepot?.id}
                <span class="depot-check"><Check size={14} strokeWidth={3} /></span>
              {:else}
                <span class="depot-arrow"><ChevronRight size={16} strokeWidth={2} /></span>
              {/if}
            </button>
          {/each}
        </div>

        <!-- Toggle: entrar automáticamente -->
        <button class="toggle-row" on:click={toggleAutoEnter}>
          <span class="toggle-label">Entrar automáticamente</span>
          <span class="toggle-hint">Usa el último depósito al abrir la app</span>
          <span class="toggle-track" class:on={autoEnter}>
            <span class="toggle-thumb"></span>
          </span>
        </button>

        <!-- Formulario inline para crear depósito -->
        {#if showNewDepot}
          <div class="new-depot-form">
            <input
              class="new-depot-input"
              type="text"
              placeholder="Nombre del depósito"
              maxlength="60"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="words"
              bind:value={newDepotName}
              on:keydown={(e) => e.key === 'Enter' && handleCreateDepot()}
            />
            {#if createError}
              <p class="new-depot-error" class:is-warning={createError.startsWith('WARN')}>{createError}</p>
            {/if}
            <div class="new-depot-actions">
              <button class="btn-ghost" on:click={toggleNewDepot} disabled={creatingDepot}>
                Cancelar
              </button>
              <button class="btn-primary" on:click={handleCreateDepot} disabled={creatingDepot}>
                {creatingDepot ? 'Creando...' : ''}{#if !creatingDepot}<Check size={14} strokeWidth={3} />{/if}{creatingDepot ? ' Creando...' : ' Crear'}
              </button>
            </div>
          </div>
        {:else}
          <button class="add-depot-btn" on:click={toggleNewDepot}>
            + Nuevo depósito
          </button>
      {/if}
      </section>

      <div class="divider"></div>

      <!-- Sección: Tema -->
      <section class="section">
        <p class="section-label">Apariencia</p>
        <button class="action-row" on:click={toggleTheme}>
          <span class="action-icon">{$theme === 'dark' ? '☀' : '☾'}</span>
          <span class="action-label">
            {$theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          </span>
          <span class="action-badge">{$theme === 'dark' ? 'Dark' : 'Light'}</span>
        </button>
      </section>

      <div class="divider"></div>

      <!-- Sección: Sincronización -->
      <section class="section">
        <p class="section-label">Sincronización</p>
        <button
          class="action-row sync-row"
          class:sync-ok={syncResult === 'ok'}
          class:sync-error={syncResult === 'error'}
          on:click={handleForceSync}
          disabled={syncing}
        >
          <span class="action-icon">{#if syncing}<Loader2 size={16} class="spin" />{:else}<RefreshCw size={16} strokeWidth={2} />{/if}</span>
          <span class="action-label">
            {#if syncing}
              {syncMessage}
            {:else if syncResult === 'ok'}
              {syncMessage}
            {:else if syncResult === 'error'}
              {syncMessage}
            {:else}
              Forzar actualización
            {/if}
          </span>
          {#if !syncing && syncResult === 'idle'}
            <span class="action-badge"><Download size={10} strokeWidth={2.5} /> DB</span>
          {/if}
        </button>
        <p class="sync-hint">Sube cambios locales y descarga la base de datos completa.</p>
      </section>



      <div class="divider"></div>

      <!-- Sección: Herramientas -->
      <section class="section">
        <p class="section-label">Herramientas</p>
        
        <a href="/clasificar" class="action-row" style="margin-bottom: 8px; text-decoration: none; color: inherit;">
          <span class="action-icon"><Hexagon size={16} strokeWidth={2} /></span>
          <span class="action-label">Clasificar productos</span>
        </a>

        <a href="/ajustes" class="action-row" style="text-decoration: none; color: inherit;" on:click={close}>
          <span class="action-icon"><ExternalLink size={16} strokeWidth={2} /></span>
          <span class="action-label">Categorías y sub-depósitos</span>
          <span class="action-badge" style="font-size:10px">→</span>
        </a>
        <a href="/settings" class="action-row" style="text-decoration: none; color: inherit;">
          <span class="action-icon"><Settings size={16} strokeWidth={2} /></span>
          <span class="action-label">Umbrales de stock</span>
        </a>

        <div class="export-wrap">
          <ExportCSV {products} {depotId} {categoryLabel} />
          <span class="export-hint">
            Exporta {products.length} producto{products.length !== 1 ? 's' : ''} visibles como CSV
          </span>
        </div>
      </section>

    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 200;
    display: flex;
    align-items: flex-end;
  }

  .sheet {
    width: 100%;
    background: var(--bg-card);
    border: 1px solid var(--border-hi);
    border-bottom: none;
    border-radius: 20px 20px 0 0;
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    max-height: 85dvh;
    overflow-y: auto;
    animation: slide-up 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes slide-up {
    from { transform: translateY(40px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }

  /* ── Toggle ── */
  .toggle-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 13px 15px;
    background: var(--bg, #0d0d0d);
    border: 1.5px solid var(--border, #2a2a2a);
    border-radius: 10px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    margin-top: 8px;
    text-align: left;
    transition: border-color 0.15s;
  }

  .toggle-row:active { border-color: var(--amber, #f5a623); }

  .toggle-label {
    font-family: var(--font-ui, sans-serif);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-hi, #f0f0f0);
    flex: 1;
    line-height: 1.2;
  }

  .toggle-hint {
    display: none;
  }

  .toggle-track {
    flex-shrink: 0;
    width: 44px;
    height: 26px;
    border-radius: 13px;
    background: var(--border-hi, #3a3a3a);
    position: relative;
    transition: background 0.22s;
  }

  .toggle-track.on {
    background: var(--amber, #f5a623);
  }

  .toggle-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  }

  .toggle-track.on .toggle-thumb {
    transform: translateX(18px);
  }

  /* ── Nuevo depósito ── */
  .add-depot-btn {
    width: 100%;
    height: 40px;
    margin-top: 8px;
    border-radius: 8px;
    border: 1.5px dashed var(--border-hi, #3a3a3a);
    background: transparent;
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-ui, sans-serif);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, color 0.15s;
  }

  .add-depot-btn:active {
    border-color: var(--amber, #f5a623);
    color: var(--amber, #f5a623);
  }

  .new-depot-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
  }

  .new-depot-input {
    width: 100%;
    height: 44px;
    padding: 0 12px;
    background: var(--bg, #0d0d0d);
    border: 1.5px solid var(--amber, #f5a623);
    border-radius: 8px;
    color: var(--text-hi, #f0f0f0);
    font-family: var(--font-ui, sans-serif);
    font-size: 15px;
    outline: none;
    box-sizing: border-box;
  }

  .new-depot-error {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--red, #f87171);
    background: #2a0a0a;
    border-radius: 4px;
    padding: 6px 10px;
  }

  .new-depot-error.is-warning {
    color: var(--amber, #f5a623);
    background: var(--amber-bg, #1a1200);
  }

  .new-depot-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .btn-ghost {
    height: 40px;
    border-radius: 7px;
    border: 1px solid var(--border-hi, #3a3a3a);
    background: var(--bg, #0d0d0d);
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-ui, sans-serif);
    font-size: 14px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .btn-primary {
    height: 40px;
    border-radius: 7px;
    border: none;
    background: var(--amber, #f5a623);
    color: #000;
    font-family: var(--font-ui, sans-serif);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: opacity 0.15s;
  }

  .btn-primary:active { opacity: 0.75; }

  /* Handle */
  .sheet-handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--border-hi);
    margin: 12px auto 0;
  }

  /* Header */
  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px 12px;
  }

  .sheet-title {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    color: var(--text-lo);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .close-btn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-mid);
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  /* Sections */
  .section {
    padding: 10px 16px 14px;
  }

  .section-label {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-lo);
    margin-bottom: 10px;
  }

  .divider {
    height: 1px;
    background: var(--border);
    margin: 0 16px;
  }

  /* Depots */
  .depot-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .depot-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 15px;
    background: var(--bg);
    border: 1.5px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, background 0.15s;
    text-align: left;
  }

  .depot-row.active {
    border-color: var(--amber);
    background: color-mix(in srgb, var(--amber) 8%, var(--bg));
  }

  .depot-icon { font-size: 16px; color: var(--amber); flex-shrink: 0; }

  .depot-name {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 700;
    color: var(--text-hi);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .depot-check { color: var(--amber); font-size: 13px; font-weight: 700; }
  .depot-arrow { color: var(--text-lo); font-size: 14px; }

  /* Actions */
  .action-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 15px;
    background: var(--bg);
    border: 1.5px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s;
    text-align: left;
  }

  .action-row:active { border-color: var(--amber); }

  .action-icon { font-size: 18px; flex-shrink: 0; }

  .action-label {
    flex: 1;
    font-family: var(--font-ui);
    font-size: 15px;
    font-weight: 500;
    color: var(--text-hi);
  }

  .action-badge {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-lo);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 7px;
    flex-shrink: 0;
  }

  /* Export wrap */
  .export-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .export-hint {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-lo);
    letter-spacing: 0.03em;
  }

  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }


  /* Dead letters */
  .dl-header { display: flex; align-items: center; justify-content: space-between; }
  .dl-toggle { font-family: var(--font-mono); font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-hi); background: none; color: var(--text-lo); cursor: pointer; }
  .dl-desc { font-family: var(--font-mono); font-size: 11px; color: var(--text-lo); line-height: 1.4; }
  .dl-list { display: flex; flex-direction: column; gap: 4px; }
  .dl-row { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; background: var(--red-dim, #1a0808); border: 1px solid var(--red, #f87171); border-radius: 6px; }
  .dl-info { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .dl-type { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--red, #f87171); }
  .dl-error { font-family: var(--font-mono); font-size: 10px; color: var(--text-lo); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dl-date { font-family: var(--font-mono); font-size: 10px; color: var(--text-lo); }
  .dl-dismiss { flex-shrink: 0; width: 30px; height: 30px; border-radius: 4px; border: 1px solid var(--border-hi); background: none; color: var(--text-lo); display: flex; align-items: center; justify-content: center; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .dl-dismiss:hover { border-color: var(--red); color: var(--red); }
  .dl-clear-all { width: 100%; height: 36px; border-radius: 6px; border: 1.5px solid var(--red, #f87171); background: #2a0a0a; color: var(--red, #f87171); font-family: var(--font-mono); font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 4px; }

  .sync-row          { transition: border-color 0.15s, color 0.15s; }
  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
  .sync-row.sync-ok  { border-color: var(--green, #4ade80); color: var(--green, #4ade80); }
  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
  .sync-row.sync-error { border-color: var(--red, #f87171); color: var(--red, #f87171); }
  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
  .sync-row:disabled { opacity: 0.7; cursor: not-allowed; }

  .sync-hint {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-lo);
    letter-spacing: 0.03em;
    margin-top: 4px;
    padding: 0 2px;
  }

  .spin {
    display: inline-block;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
</style>