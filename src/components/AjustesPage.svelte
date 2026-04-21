<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ChevronLeft, Tag, Layers, Plus, X, Check,
    AlertTriangle, Loader2, Hexagon, ChevronRight,
  } from 'lucide-svelte';
  import Skeleton from './Skeleton.svelte';
  import BottomNav from './BottomNav.svelte';
  import SettingsSheet from './SettingsSheet.svelte';
  import { initTheme } from '../lib/themeStore';
  import { getDepots, getSubDepots, saveSubDepots, saveCategories, getCategoriesLocal } from '../lib/idb';
  import {
    fetchCategories, upsertCategory, deleteCategory,
    fetchSubDepots, createSubDepot,
  } from '../lib/supabase';
  import type { Depot } from '../lib/supabase';
  import type { SubDepot } from '../lib/idb';

  // ── Secciones ────────────────────────────────────────────────
  let showSettings = false;
  type Section = 'home' | 'categories' | 'subdepots';
  let section: Section = 'home';

  // ── Categorías ───────────────────────────────────────────────
  let categories: string[]  = [];
  let catLoading            = false;
  let catError              = '';
  let newCatName            = '';
  let catSaving             = false;
  let catDeleteConfirm: string | null = null;

  async function loadCategories() {
    catLoading = true; catError = '';
    try {
      categories = await fetchCategories();
      // Guardar en IndexedDB para uso offline
      await saveCategories(categories);
    } catch {
      // Si falla la red, usar caché local
      categories = await getCategoriesLocal();
      if (categories.length === 0) catError = 'No se pudieron cargar las categorías.';
    } finally { catLoading = false; }
  }

  async function handleAddCat() {
    const name = newCatName.trim();
    if (!name) return;
    catSaving = true; catError = '';
    try {
      await upsertCategory(name);
      newCatName = '';
      await loadCategories(); // también actualiza IndexedDB dentro
    } catch { catError = 'Error al guardar.'; }
    finally { catSaving = false; }
  }

  async function handleDeleteCat(name: string) {
    if (catDeleteConfirm !== name) { catDeleteConfirm = name; return; }
    catDeleteConfirm = null;
    try { await deleteCategory(name); await loadCategories(); }
    catch { catError = 'Error al eliminar.'; }
  }

  function cancelDeleteCat() { catDeleteConfirm = null; }

  // ── Sub-depósitos ────────────────────────────────────────────
  let depots: Depot[]       = [];
  let subDepots: SubDepot[] = [];
  let sdLoading             = false;
  let sdError               = '';
  let selectedDepotId: number | null = null;
  let newSubName            = '';
  let sdSaving              = false;
  let sdDeleteConfirm: number | null = null;

  async function loadSubDepots() {
    sdLoading = true; sdError = '';
    try {
      depots    = await getDepots();
      subDepots = await fetchSubDepots();
      await saveSubDepots(subDepots);
      if (!selectedDepotId && depots.length > 0) selectedDepotId = depots[0].id;
    } catch { sdError = 'No se pudieron cargar los sub-depósitos.'; }
    finally { sdLoading = false; }
  }

  $: filteredSubs = subDepots.filter(s => s.depot_id === selectedDepotId);

  async function handleAddSub() {
    if (!newSubName.trim() || !selectedDepotId) return;
    sdSaving = true; sdError = '';
    try {
      const created = await createSubDepot(selectedDepotId, newSubName.trim());
      subDepots = [...subDepots, created];
      await saveSubDepots(subDepots);
      newSubName = '';
    } catch { sdError = 'Error al crear el sub-depósito.'; }
    finally { sdSaving = false; }
  }

  // ── Navegación ───────────────────────────────────────────────
  function goTo(s: Section) {
    section = s;
    if (s === 'categories') loadCategories();
    if (s === 'subdepots')  loadSubDepots();
  }

  function goHome() {
    section = 'home';
    catDeleteConfirm = null;
    sdDeleteConfirm  = null;
  }

  onMount(() => { initTheme(); });

  const SECTION_TITLES: Record<Section, string> = {
    home:       'Ajustes',
    categories: 'Categorías',
    subdepots:  'Sub-depósitos',
  };
</script>

<div class="page-wrap">
  <div class="page-content">

    <!-- ── Header ──────────────────────────────────────────────── -->
    <header class="aj-header">
      {#if section !== 'home'}
        <button class="back-btn" on:click={goHome} aria-label="Volver">
          <ChevronLeft size={20} strokeWidth={2} />
        </button>
      {/if}
      <span class="aj-title">
        <Hexagon size={14} strokeWidth={2.5} />
        {SECTION_TITLES[section]}
      </span>
    </header>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- HOME                                                       -->
    <!-- ══════════════════════════════════════════════════════════ -->
    {#if section === 'home'}
      <div class="menu-list">

        <button class="menu-row" on:click={() => goTo('categories')}>
          <span class="menu-icon cat-icon"><Tag size={18} strokeWidth={1.5} /></span>
          <div class="menu-text">
            <span class="menu-label">Categorías</span>
            <span class="menu-desc">Crear, editar y eliminar categorías de productos</span>
          </div>
          <ChevronRight size={16} strokeWidth={2} class="menu-arrow" />
        </button>

        <button class="menu-row" on:click={() => goTo('subdepots')}>
          <span class="menu-icon sub-icon"><Layers size={18} strokeWidth={1.5} /></span>
          <div class="menu-text">
            <span class="menu-label">Sub-depósitos</span>
            <span class="menu-desc">Secciones dentro de cada depósito (estantes, zonas)</span>
          </div>
          <ChevronRight size={16} strokeWidth={2} class="menu-arrow" />
        </button>

      </div>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- CATEGORÍAS                                                 -->
    <!-- ══════════════════════════════════════════════════════════ -->
    {:else if section === 'categories'}

      {#if catLoading}
        <div class="skel-list">
          {#each Array(6) as _}
            <Skeleton height={52} radius={8} mb={6} />
          {/each}
        </div>

      {:else}
        <!-- Lista -->
        <div class="item-list">
          {#each categories as cat}
            <div class="item-row" class:pending-delete={catDeleteConfirm === cat}>
              <span class="item-name">{cat}</span>

              {#if catDeleteConfirm === cat}
                <!-- Estado de confirmación: ocupa toda la fila -->
                <div class="delete-confirm-row">
                  <span class="delete-confirm-label">
                    <AlertTriangle size={13} strokeWidth={2.5} />
                    ¿Eliminar "{cat}"?
                  </span>
                  <button class="btn-cancel-del" on:click={cancelDeleteCat}>
                    Cancelar
                  </button>
                  <button class="btn-confirm-del" on:click={() => handleDeleteCat(cat)}>
                    Eliminar
                  </button>
                </div>
              {:else}
                <button
                  class="item-delete"
                  on:click={() => handleDeleteCat(cat)}
                  aria-label="Eliminar {cat}"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              {/if}
            </div>
          {/each}

          {#if categories.length === 0 && !catLoading}
            <p class="empty-msg">Sin categorías. Agregá la primera abajo.</p>
          {/if}
        </div>

        {#if catError}
          <p class="error-msg"><AlertTriangle size={12} strokeWidth={2.5} /> {catError}</p>
        {/if}

        <!-- Formulario agregar -->
        <div class="add-form">
          <p class="add-form-label">Nueva categoría</p>
          <div class="add-row">
            <input
              class="add-input"
              type="text"
              placeholder="Ej: Lácteos, Limpieza..."
              bind:value={newCatName}
              on:keydown={(e) => e.key === 'Enter' && handleAddCat()}
              autocomplete="off"
              autocorrect="off"
            />
            <button
              class="add-btn"
              on:click={handleAddCat}
              disabled={catSaving || !newCatName.trim()}
              aria-label="Agregar categoría"
            >
              {#if catSaving}
                <Loader2 size={16} class="spin" />
              {:else}
                <Check size={16} strokeWidth={3} />
              {/if}
            </button>
          </div>
        </div>
      {/if}

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- SUB-DEPÓSITOS                                              -->
    <!-- ══════════════════════════════════════════════════════════ -->
    {:else if section === 'subdepots'}

      {#if sdLoading}
        <div class="skel-list">
          {#each Array(5) as _}
            <Skeleton height={52} radius={8} mb={6} />
          {/each}
        </div>

      {:else}
        <!-- Selector de depósito padre -->
        {#if depots.length > 1}
          <div class="depot-tabs">
            {#each depots as d}
              <button
                class="depot-tab"
                class:active={selectedDepotId === d.id}
                on:click={() => (selectedDepotId = d.id)}
              >{d.name}</button>
            {/each}
          </div>
        {/if}

        <!-- Lista de sub-depósitos del depósito seleccionado -->
        <div class="item-list">
          {#each filteredSubs as sub}
            <div class="item-row">
              <span class="item-name">{sub.name}</span>
              <!-- Borrar sub-depósito: por ahora solo muestra el nombre -->
              <!-- (el borrado requiere reasignar productos, se implementará después) -->
              <span class="item-hint">ID {sub.id}</span>
            </div>
          {/each}
          {#if filteredSubs.length === 0}
            <p class="empty-msg">
              Sin sub-depósitos para este depósito. Agregá el primero abajo.
            </p>
          {/if}
        </div>

        {#if sdError}
          <p class="error-msg"><AlertTriangle size={12} strokeWidth={2.5} /> {sdError}</p>
        {/if}

        <!-- Formulario agregar -->
        <div class="add-form">
          <p class="add-form-label">Nuevo sub-depósito</p>
          <div class="add-row">
            <input
              class="add-input"
              type="text"
              placeholder="Ej: Estante A, Zona Fría..."
              bind:value={newSubName}
              on:keydown={(e) => e.key === 'Enter' && handleAddSub()}
              autocomplete="off"
              autocorrect="off"
            />
            <button
              class="add-btn"
              on:click={handleAddSub}
              disabled={sdSaving || !newSubName.trim() || !selectedDepotId}
              aria-label="Agregar sub-depósito"
            >
              {#if sdSaving}
                <Loader2 size={16} class="spin" />
              {:else}
                <Check size={16} strokeWidth={3} />
              {/if}
            </button>
          </div>
          <p class="add-hint">
            El sub-depósito se creará dentro de
            "{depots.find(d => d.id === selectedDepotId)?.name ?? '...'}"
          </p>
        </div>
      {/if}
    {/if}

  </div>

  <BottomNav activePage="settings" on:settings={() => (showSettings = true)} />
  <SettingsSheet
    open={showSettings}
    products={[]}
    depotId={1}
    categoryLabel="Todos"
    depots={[]}
    activeDepot={null}
    on:close={() => (showSettings = false)}
  />
</div>

<style>
  .page-wrap { display: flex; flex-direction: column; min-height: 100dvh; background: var(--bg); }
  .page-content {
    flex: 1;
    padding: var(--gap, 14px);
    padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px) + 20px);
    max-width: 540px; width: 100%; margin: 0 auto; box-sizing: border-box;
  }

  /* Header */
  .aj-header {
    display: flex; align-items: center; gap: 10px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 20px;
  }
  .aj-title {
    display: flex; align-items: center; gap: 8px;
    font-family: var(--font-mono); font-size: 13px; font-weight: 700;
    color: var(--text-hi); text-transform: uppercase; letter-spacing: 0.1em;
    flex: 1;
  }
  .back-btn {
    width: 36px; height: 36px; border-radius: 50%;
    border: 1px solid var(--border); background: var(--bg-card);
    color: var(--text-mid); display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; -webkit-tap-highlight-color: transparent;
  }

  /* Menú home */
  .menu-list { display: flex; flex-direction: column; gap: 8px; }
  .menu-row {
    display: flex; align-items: center; gap: 14px;
    padding: 16px 16px; background: var(--bg-card);
    border: 1px solid var(--border); border-radius: 12px;
    cursor: pointer; text-align: left; width: 100%;
    -webkit-tap-highlight-color: transparent; transition: border-color 0.15s;
  }
  .menu-row:active { border-color: var(--amber); }
  .menu-icon {
    width: 40px; height: 40px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .cat-icon { background: #1a1200; color: var(--amber); border: 1px solid var(--amber-dim, #b57a1a); }
  .sub-icon { background: #0d1a2a; color: #60a5fa;   border: 1px solid #1e3a5a; }
  .menu-text { flex: 1; display: flex; flex-direction: column; gap: 3px; }
  .menu-label { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--text-hi); }
  .menu-desc  { font-family: var(--font-ui); font-size: 12px; color: var(--text-lo); line-height: 1.3; }
  :global(.menu-arrow) { color: var(--text-lo); flex-shrink: 0; }

  /* Listas de items */
  .item-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }

  .item-row {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 16px;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
    min-height: 52px; transition: border-color 0.15s;
  }
  .item-row.pending-delete {
    border-color: var(--red, #f87171);
    background: #1a0808;
    flex-wrap: wrap;
  }

  .item-name {
    flex: 1;
    font-family: var(--font-ui); font-size: 16px; font-weight: 600;
    color: var(--text-hi);
  }
  .item-hint {
    font-family: var(--font-mono); font-size: 10px; color: var(--text-lo);
  }

  /* Botón eliminar — grande para guantes */
  .item-delete {
    width: 44px; height: 44px; border-radius: 8px;
    border: 1.5px solid var(--border-hi, #3a3a3a); background: none;
    color: var(--text-lo); display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .item-delete:hover, .item-delete:active {
    border-color: var(--red, #f87171);
    color: var(--red, #f87171);
    background: #1a0808;
  }

  /* Confirmación de borrado — ocupa toda la fila, con texto claro */
  .delete-confirm-row {
    width: 100%; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }
  .delete-confirm-label {
    flex: 1; display: flex; align-items: center; gap: 6px;
    font-family: var(--font-mono); font-size: 12px; font-weight: 700;
    color: var(--red, #f87171);
  }
  .btn-cancel-del {
    height: 40px; padding: 0 16px; border-radius: 8px;
    border: 1.5px solid var(--border-hi, #3a3a3a); background: var(--bg-card);
    color: var(--text-mid); font-family: var(--font-mono); font-size: 12px;
    font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  .btn-confirm-del {
    height: 40px; padding: 0 16px; border-radius: 8px;
    border: 1.5px solid var(--red, #f87171); background: #2a0a0a;
    color: var(--red, #f87171); font-family: var(--font-mono); font-size: 12px;
    font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent;
  }

  /* Selector de depósito para sub-depósitos */
  .depot-tabs {
    display: flex; gap: 6px; flex-wrap: wrap;
    margin-bottom: 14px;
  }
  .depot-tab {
    height: 34px; padding: 0 14px; border-radius: 17px;
    border: 1.5px solid var(--border-hi, #3a3a3a); background: var(--bg-card);
    color: var(--text-mid); font-family: var(--font-mono); font-size: 12px;
    font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .depot-tab.active {
    border-color: var(--amber); color: var(--amber); background: #1a1200;
  }

  /* Formulario agregar */
  .add-form {
    background: var(--bg-card); border: 1px solid var(--border-hi, #3a3a3a);
    border-radius: 12px; padding: 16px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .add-form-label {
    font-family: var(--font-mono); font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-lo);
  }
  .add-row { display: flex; gap: 10px; }
  .add-input {
    flex: 1; height: 48px; padding: 0 14px;
    background: var(--bg); border: 1.5px solid var(--border); border-radius: 8px;
    color: var(--text-hi); font-family: var(--font-ui); font-size: 15px;
    outline: none; transition: border-color 0.15s;
  }
  .add-input:focus { border-color: var(--amber); }
  .add-btn {
    width: 48px; height: 48px; border-radius: 8px;
    border: 1.5px solid var(--amber-dim, #b57a1a); background: #1a1200;
    color: var(--amber); display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0;
    -webkit-tap-highlight-color: transparent; transition: background 0.15s;
  }
  .add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .add-btn:not(:disabled):active { background: #2a1e00; }
  .add-hint {
    font-family: var(--font-mono); font-size: 11px; color: var(--text-lo); line-height: 1.4;
  }

  /* Estados */
  .empty-msg {
    font-family: var(--font-mono); font-size: 12px; color: var(--text-lo);
    padding: 12px 4px; text-align: center;
  }
  .error-msg {
    display: flex; align-items: center; gap: 6px;
    font-family: var(--font-mono); font-size: 12px; color: var(--red, #f87171);
    padding: 8px 12px; background: #1a0808; border-radius: 6px; margin-bottom: 10px;
  }
  .skel-list { display: flex; flex-direction: column; }

  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
