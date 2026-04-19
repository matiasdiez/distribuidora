<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ChevronLeft, Tag, Layers, Plus, X, Check,
    AlertTriangle, Loader2, Hexagon, ChevronRight,
    PackageSearch, CheckSquare, Square,
  } from 'lucide-svelte';
  import Skeleton from './Skeleton.svelte';
  import BottomNav from './BottomNav.svelte';
  import SettingsSheet from './SettingsSheet.svelte';
  import { initTheme } from '../lib/themeStore';
  import { getDepots, getSubDepots, saveSubDepots, saveCategories, getCategoriesLocal, searchProducts, assignProductsToSubDepotLocal } from '../lib/idb';
  import {
    fetchCategories, upsertCategory, deleteCategory,
    fetchSubDepots, createSubDepot,
  } from '../lib/supabase';
  import type { Depot } from '../lib/supabase';
  import type { SubDepot } from '../lib/idb';

  // ── Secciones ────────────────────────────────────────────────
  let showSettings = false;
  type Section = 'home' | 'categories' | 'subdepots' | 'assign_subdepot';
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

  // ── Asignación de productos a sub-depósito ───────────────────
  let assignProducts: Awaited<ReturnType<typeof searchProducts>> = [];
  let assignLoading     = false;
  let assignSubDepotId: number | null = null;
  let assignQuery       = '';
  let assignSelected    = new Set<number>();
  let assignSaving      = false;
  let assignSavedCount  = 0;

  async function loadAssignProducts() {
    assignLoading = true;
    assignProducts = await searchProducts('', undefined, selectedDepotId ?? undefined);
    assignLoading  = false;
  }

  $: if (section === 'assign_subdepot') loadAssignProducts();

  function toggleAssign(id: number) {
    const s = new Set(assignSelected);
    s.has(id) ? s.delete(id) : s.add(id);
    assignSelected = s;
  }

  async function confirmAssign() {
    if (!assignSelected.size) return;
    assignSaving = true;
    try {
      await assignProductsToSubDepotLocal([...assignSelected], assignSubDepotId);
      assignProducts = assignProducts.map(p =>
        assignSelected.has(p.id) ? { ...p, sub_depot_id: assignSubDepotId } as any : p
      );
      assignSavedCount = assignSelected.size;
      assignSelected   = new Set();
      setTimeout(() => (assignSavedCount = 0), 2500);
    } finally { assignSaving = false; }
  }

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
    if (s === 'categories')     loadCategories();
    if (s === 'subdepots')      loadSubDepots();
    if (s === 'assign_subdepot') { loadSubDepots(); }
  }

  function goHome() {
    section = 'home';
    catDeleteConfirm = null;
    sdDeleteConfirm  = null;
  }

  onMount(() => { initTheme(); });

  const SECTION_TITLES: Record<Section, string> = {
    home:            'Ajustes',
    categories:      'Categorías',
    subdepots:       'Sub-depósitos',
    assign_subdepot: 'Asignar sectores',
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

        <button class="menu-row" on:click={() => goTo('assign_subdepot')}>
          <span class="menu-icon assign-icon"><PackageSearch size={18} strokeWidth={1.5} /></span>
          <div class="menu-text">
            <span class="menu-label">Asignar sectores</span>
            <span class="menu-desc">Asignar productos a sub-depósitos en bloque</span>
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

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- ASIGNAR SECTORES (bulk assign products to sub-depots)      -->
    <!-- ══════════════════════════════════════════════════════════ -->
    {:else if section === 'assign_subdepot'}

      {#if !selectedDepotId || filteredSubs.length === 0}
        <div class="empty-msg">
          Primero creá al menos un sub-depósito en la sección "Sub-depósitos".
        </div>
      {:else}
        <!-- Selector de sub-depósito destino -->
        <div class="assign-header">
          <p class="add-form-label">Asignar a sector</p>
          <div class="depot-tabs" style="margin-bottom: 0;">
            <button
              class="depot-tab"
              class:active={assignSubDepotId === null}
              on:click={() => (assignSubDepotId = null)}
            >Sin sector</button>
            {#each filteredSubs as sub}
              <button
                class="depot-tab"
                class:active={assignSubDepotId === sub.id}
                on:click={() => (assignSubDepotId = sub.id)}
              >{sub.name}</button>
            {/each}
          </div>
        </div>

        <!-- Lista de productos -->
        <div class="assign-toolbar">
          <span class="assign-count">
            {assignSelected.size > 0 ? `${assignSelected.size} seleccionado(s)` : `${assignProducts.length} productos`}
          </span>
          <button class="assign-select-all"
            on:click={() => {
              if (assignSelected.size === assignProducts.length) {
                assignSelected = new Set();
              } else {
                assignSelected = new Set(assignProducts.map(p => p.id));
              }
            }}
          >
            {#if assignSelected.size === assignProducts.length && assignProducts.length > 0}
              <CheckSquare size={14} strokeWidth={2} /> Deseleccionar
            {:else}
              <Square size={14} strokeWidth={2} /> Seleccionar todo
            {/if}
          </button>
        </div>

        <div class="assign-list">
          {#each assignProducts as p}
            <button
              class="assign-row"
              class:selected={assignSelected.has(p.id)}
              on:click={() => {
                const s = new Set(assignSelected);
                s.has(p.id) ? s.delete(p.id) : s.add(p.id);
                assignSelected = s;
              }}
            >
              <span class="assign-check">
                {#if assignSelected.has(p.id)}
                  <CheckSquare size={18} strokeWidth={2} />
                {:else}
                  <Square size={18} strokeWidth={2} />
                {/if}
              </span>
              <span class="assign-brand">{p.brand}</span>
              <span class="assign-desc">{p.description}</span>
              {#if (p as any).sub_depot_id}
                <span class="assign-current">
                  {filteredSubs.find(s => s.id === (p as any).sub_depot_id)?.name ?? ''}
                </span>
              {/if}
            </button>
          {/each}
        </div>

        {#if assignSelected.size > 0}
          <div class="assign-footer">
            <button
              class="add-btn assign-confirm-btn"
              on:click={async () => {
                if (!assignSelected.size) return;
                try {
                  await assignProductsToSubDepotLocal([...assignSelected], assignSubDepotId);
                  assignProducts = assignProducts.map(p =>
                    assignSelected.has(p.id) ? { ...p, sub_depot_id: assignSubDepotId } as any : p
                  );
                  assignSelected = new Set();
                } catch {}
              }}
              disabled={assignSubDepotId === undefined}
            >
              <Check size={16} strokeWidth={3} />
              Asignar {assignSelected.size} producto(s)
            </button>
          </div>
        {/if}
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

  /* Asignar sectores */
  .assign-icon { background: #1a0d2a; color: #a78bfa; border: 1px solid #3a1a5a; }
  .assign-target { margin-bottom: 14px; }
  .assign-search-wrap { margin-bottom: 10px; }
  .assign-action-bar {
    display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
    padding: 10px 12px; background: var(--bg-card);
    border: 1px solid var(--amber-dim, #b57a1a); border-radius: 8px;
  }
  .assign-count { flex: 1; font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--amber); }
  .assign-saved-msg { font-family: var(--font-mono); font-size: 11px; color: var(--green); display: flex; align-items: center; gap: 5px; margin-bottom: 6px; }
  .assign-row {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px; background: var(--bg-card);
    border: 1px solid var(--border); border-radius: 8px; cursor: pointer;
    -webkit-tap-highlight-color: transparent; transition: border-color 0.15s, background 0.15s;
  }
  .assign-row.selected { border-color: var(--amber); background: #1a1200; }
  .assign-check { flex-shrink: 0; color: var(--text-lo); }
  .assign-row.selected .assign-check { color: var(--amber); }
  .assign-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .assign-brand { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--amber); text-transform: uppercase; }
  .assign-desc { font-family: var(--font-ui); font-size: 14px; color: var(--text-hi); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .assign-current { font-family: var(--font-mono); font-size: 10px; color: #60a5fa; background: #0d1a2a; padding: 2px 6px; border-radius: 3px; white-space: nowrap; flex-shrink: 0; }
  .assign-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .assign-count { font-family: var(--font-mono); font-size: 11px; color: var(--text-lo); font-weight: 700; }
  .assign-select-all { display: flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 4px; border: 1px solid var(--border-hi); background: none; color: var(--text-mid); cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .assign-row { display: flex; align-items: center; gap: 10px; padding: 11px 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; text-align: left; width: 100%; -webkit-tap-highlight-color: transparent; transition: border-color 0.15s, background 0.15s; }
  .assign-row.selected { border-color: var(--amber); background: #1a1200; }
  .assign-check { color: var(--text-lo); flex-shrink: 0; }
  .assign-row.selected .assign-check { color: var(--amber); }
  .assign-footer { position: fixed; bottom: calc(64px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%); width: 100%; max-width: 540px; padding: 10px 14px; background: var(--bg-card); border-top: 1px solid var(--border); box-sizing: border-box; }
  .assign-confirm-btn { width: 100%; height: 52px; display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: 10px; border: none; background: var(--amber); color: #000; font-family: var(--font-ui); font-size: 16px; font-weight: 700; cursor: pointer; }
  .assign-confirm-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .assign-header { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
</style>
