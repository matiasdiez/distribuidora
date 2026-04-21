<script lang="ts">
  /**
   * Skeleton — placeholder visual con animación pulse.
   *
   * Uso básico:
   *   <Skeleton height={20} width="60%" />
   *   <Skeleton height={48} radius={8} />
   *
   * Para bloques compuestos usar SkeletonCard (ver abajo).
   */
  export let height: number | string = 16;
  export let width:  string = '100%';
  export let radius: number = 4;
  export let mb:     number = 0; // margin-bottom en px
</script>

<div
  class="skeleton"
  style="
    height: {typeof height === 'number' ? height + 'px' : height};
    width: {width};
    border-radius: {radius}px;
    margin-bottom: {mb}px;
  "
></div>

<style>
  .skeleton {
    background: linear-gradient(
      90deg,
      var(--skeleton-base, #1e1e1e) 0%,
      var(--skeleton-shine, #2a2a2a) 40%,
      var(--skeleton-base, #1e1e1e) 80%
    );
    background-size: 200% 100%;
    animation: skeleton-pulse 1.6s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes skeleton-pulse {
    0%   { background-position: 200% center; }
    100% { background-position: -200% center; }
  }
</style>
