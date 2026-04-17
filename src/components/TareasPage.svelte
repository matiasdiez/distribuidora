<script lang="ts">
  import { onMount } from 'svelte';
  import Tareas from './Tareas.svelte';
  import BottomNav from './BottomNav.svelte';
  import { initTheme } from '../lib/themeStore';

  onMount(() => { initTheme(); });
</script>

<div class="page-wrap">
  <div class="page-content">
    <Tareas />
  </div>
  <BottomNav activePage="tareas" />
</div>

<style>
  .page-wrap { display: flex; flex-direction: column; min-height: 100dvh; background: var(--bg); }
  .page-content {
    flex: 1;
    padding: var(--gap, 14px);
    padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px) + var(--gap, 14px));
    max-width: 540px;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }
</style>
