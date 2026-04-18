<script lang="ts">
  import Skeleton from './Skeleton.svelte';
  export let count: number = 10;

  // Anchos variados para que no parezcan idénticas
  const widths = ['55%','70%','45%','65%','50%','75%','40%','60%','52%','68%'];
</script>

{#each Array(count) as _, i}
  <div class="skel-brand-row">
    <div class="skel-dot"></div>
    <Skeleton height={13} width={widths[i % widths.length]} radius={3} />
    <div class="skel-right">
      <Skeleton height={10} width="36px" radius={3} />
      <Skeleton height={10} width="24px" radius={3} />
    </div>
  </div>
{/each}

<style>
  .skel-brand-row {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 12px;
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 8px;
  }
  .skel-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    background: var(--border, #2a2a2a);
  }
  .skel-right { display: flex; gap: 8px; margin-left: auto; }
</style>
