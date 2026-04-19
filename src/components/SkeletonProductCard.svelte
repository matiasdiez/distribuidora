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
          <Skeleton height={11} width="80px" radius={3} />
          <Skeleton height={9}  width="48px" radius={3} />
        </div>
        <Skeleton height={22} width="90px" radius={11} />
      </div>
      <Skeleton height={22} width="75%" radius={4} mb={4} />
      <Skeleton height={11} width="40px" radius={3} mb={6} />
      <div class="skel-bottom">
        <Skeleton height={20} width="64px" radius={3} />
        <Skeleton height={34} width="80px" radius={5} />
      </div>
    </div>
  </div>
{/each}

<style>
  .skel-card {
    display: flex;
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: var(--radius, 6px);
    overflow: hidden;
  }
  .skel-bar { width: 4px; flex-shrink: 0; background: var(--skeleton-base); }
  .skel-body { flex: 1; padding: 12px 12px 10px; display: flex; flex-direction: column; gap: 8px; }
  .skel-top { display: flex; align-items: flex-start; justify-content: space-between; }
  .skel-meta { display: flex; align-items: center; gap: 8px; }
  .skel-bottom { display: flex; align-items: center; justify-content: space-between; }
</style>
