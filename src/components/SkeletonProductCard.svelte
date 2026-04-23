<script lang="ts">
  import Skeleton from './Skeleton.svelte';
  // Cantidad de tarjetas a mostrar
  export let count: number = 8;
</script>

{#each Array(count) as _}
  <div class="skel-card">
    <div class="skel-bar"></div>
    <div class="skel-body">
      <div class="skel-top">
        <div class="skel-meta">
          <Skeleton height={11} width="72px" radius={3} />
          <Skeleton height={9}  width="44px" radius={3} />
        </div>
        <Skeleton height={22} width="80px" radius={4} />
      </div>
      <Skeleton height={22} width="72%"  radius={4} />
      <Skeleton height={11} width="36px" radius={3} />
      <div class="skel-bot">
        <Skeleton height={11} width="56px" radius={3} />
        <Skeleton height={34} width="80px" radius={5} />
      </div>
    </div>
  </div>
{/each}

<style>
  .skel-card {
    display: flex;
    background: var(--bg-card, #1a1a1a);
    border-bottom: 1px solid var(--border, #2a2a2a);
  }
  .skel-card:first-child { border-top: 1px solid var(--border, #2a2a2a); }
  .skel-bar  { width: 4px; flex-shrink: 0; background: var(--border, #2a2a2a); }
  .skel-body { flex: 1; padding: 12px 14px 11px; display: flex; flex-direction: column; gap: 8px; }
  .skel-top  { display: flex; align-items: flex-start; justify-content: space-between; }
  .skel-meta { display: flex; align-items: center; gap: 8px; }
  .skel-bot  { display: flex; align-items: center; justify-content: space-between; margin-top: 2px; }

  :global([data-theme="light"]) .skel-card { background: var(--bg-card); }
  @media (prefers-color-scheme: light) {
    :global(:root:not([data-theme="dark"])) .skel-card { background: var(--bg-card); }
  }
</style>
