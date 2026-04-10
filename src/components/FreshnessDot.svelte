<script lang="ts">
  import type { FreshnessStatus } from '../lib/freshness';
  import { FRESHNESS_COLORS, FRESHNESS_LABELS } from '../lib/freshness';

  export let status: FreshnessStatus = 'red';
  export let label:  string          = '';
  export let size:   'sm' | 'md' | 'lg' = 'md';

  // Mostrar tooltip al mantener presionado
  let showTip = false;
  let tipTimer: ReturnType<typeof setTimeout>;

  function startPress() {
    tipTimer = setTimeout(() => { showTip = true; }, 300);
  }

  function endPress() {
    clearTimeout(tipTimer);
    setTimeout(() => { showTip = false; }, 1200);
  }

  $: color = FRESHNESS_COLORS[status];
  $: tip   = label || FRESHNESS_LABELS[status];
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<span
  class="dot dot--{size}"
  style="background:{color}; box-shadow: 0 0 6px {color}40;"
  title={tip}
  aria-label={tip}
  on:pointerdown={startPress}
  on:pointerup={endPress}
  on:pointercancel={endPress}
>
  {#if showTip}
    <span class="tip">{tip}</span>
  {/if}
</span>

<style>
  .dot {
    display: inline-block;
    border-radius: 50%;
    flex-shrink: 0;
    position: relative;
    cursor: default;
  }

  .dot--sm { width: 7px;  height: 7px;  }
  .dot--md { width: 10px; height: 10px; }
  .dot--lg { width: 13px; height: 13px; }

  .tip {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: #1a1a1a;
    border: 1px solid #3a3a3a;
    color: #f0f0f0;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 3px 7px;
    border-radius: 4px;
    white-space: nowrap;
    z-index: 200;
    pointer-events: none;
  }

  .tip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 4px solid transparent;
    border-top-color: #3a3a3a;
  }
</style>
