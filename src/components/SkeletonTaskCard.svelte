<script lang="ts">
  import Skeleton from './Skeleton.svelte';
  export let count: number = 6;
  const widths = ['80%','60%','90%','50%','75%','65%'];
</script>

{#each Array(count) as _, i}
  <div class="skel-task">
    <div class="skel-check"></div>
    <Skeleton height={14} width={widths[i % widths.length]} radius={3} />
  </div>
{/each}

<style>
  .skel-task {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px;
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 8px;
  }
  .skel-check {
    width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0;
    background: var(--skeleton-base);
  }
</style>
