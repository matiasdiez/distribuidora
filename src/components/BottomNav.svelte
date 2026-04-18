<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Search, ChevronsLeftRight, Store, ClipboardList, Settings } from 'lucide-svelte';

  export let activePage: 'search' | 'swipe' | 'marcas' | 'tareas' | 'settings' = 'search';

  const dispatch = createEventDispatcher<{ settings: void }>();
</script>

<nav class="bottom-nav" role="navigation" aria-label="Navegación principal">

  <a href="/" class="nav-item" class:active={activePage === 'search'}
    aria-label="Buscar productos" aria-current={activePage === 'search' ? 'page' : undefined}>
    <span class="nav-icon"><Search size={22} strokeWidth={2} /></span>
    <span class="nav-label">Buscar</span>
  </a>

  <a href="/swipe" class="nav-item" class:active={activePage === 'swipe'}
    aria-label="Modo swipe" aria-current={activePage === 'swipe' ? 'page' : undefined}>
    <span class="nav-icon"><ChevronsLeftRight size={22} strokeWidth={2} /></span>
    <span class="nav-label">Swipe</span>
  </a>

  <a href="/marcas" class="nav-item" class:active={activePage === 'marcas'}
    aria-label="Marcas" aria-current={activePage === 'marcas' ? 'page' : undefined}>
    <span class="nav-icon"><Store size={22} strokeWidth={2} /></span>
    <span class="nav-label">Marcas</span>
  </a>

  <a href="/tareas" class="nav-item" class:active={activePage === 'tareas'}
    aria-label="Tareas" aria-current={activePage === 'tareas' ? 'page' : undefined}>
    <span class="nav-icon"><ClipboardList size={22} strokeWidth={2} /></span>
    <span class="nav-label">Tareas</span>
  </a>

  <button class="nav-item" class:active={activePage === 'settings'}
    on:click={() => dispatch('settings')} aria-label="Ajustes" type="button">
    <span class="nav-icon"><Settings size={22} strokeWidth={2} /></span>
    <span class="nav-label">Ajustes</span>
  </button>

</nav>

<style>
  .bottom-nav {
    position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
    width: 100%; max-width: 540px;
    height: calc(64px + env(safe-area-inset-bottom, 0px));
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: var(--bg-card);
    border-top: 1px solid var(--border);
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    align-items: stretch;
    z-index: 90;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .nav-item {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 3px; padding: 8px 4px;
    color: var(--text-lo); text-decoration: none;
    font-family: var(--font-ui); font-size: 10px; font-weight: 500; letter-spacing: 0.02em;
    border: none; background: transparent; cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: color 0.15s; position: relative;
  }

  .nav-item.active { color: var(--amber); }

  .nav-item.active::before {
    content: ''; position: absolute; top: 0; left: 20%; width: 60%; height: 2px;
    background: var(--amber); border-radius: 0 0 3px 3px;
  }

  .nav-icon { display: flex; align-items: center; justify-content: center; transition: transform 0.15s; }
  .nav-item:active .nav-icon { transform: scale(0.88); }
  .nav-label { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
</style>
