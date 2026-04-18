<script lang="ts">
  import { onMount } from 'svelte';
  import Marcas from './Marcas.svelte';
  import BottomNav from './BottomNav.svelte';
  import SettingsSheet from './SettingsSheet.svelte';
  import { loadSavedDepot } from '../lib/depotStore';
  import { initTheme } from '../lib/themeStore';

  let depotId = 1;
  let showSettings = false;

  onMount(() => {
    initTheme();
    const d = loadSavedDepot();
    if (d?.id) depotId = d.id;
  });
</script>

<div class="page-wrap">
  <div class="page-content">
    <Marcas {depotId} />
  </div>
  <BottomNav activePage="marcas" on:settings={() => (showSettings = true)} />
  <SettingsSheet
    open={showSettings}
    products={[]}
    {depotId}
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
    padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px) + var(--gap, 14px));
    max-width: 540px;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }
</style>
