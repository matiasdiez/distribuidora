<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { onSyncStatus, type SyncStatus } from '../lib/sync';
  import { getPendingSync } from '../lib/idb';

  let status: SyncStatus = 'idle';
  let message = '';
  let pendingCount = 0;
  let visible = false;
  let hideTimer: ReturnType<typeof setTimeout>;

  // Unsub del listener de sync
  let unsub: () => void;

  onMount(async () => {
    status = navigator.onLine ? 'idle' : 'offline';

    // Chequear pendientes al iniciar
    const pending = await getPendingSync();
    pendingCount = pending.length;

    unsub = onSyncStatus(async (s, msg) => {
      status = s;
      message = msg ?? '';

      // Actualizar pendientes
      const p = await getPendingSync();
      pendingCount = p.length;

      // Mostrar notificación breve si es success o error
      if (s === 'success' || s === 'error') {
        visible = true;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          visible = false;
          status = navigator.onLine ? 'idle' : 'offline';
        }, 3000);
      } else {
        visible = true;
      }
    });
  });

  onDestroy(() => {
    unsub?.();
    clearTimeout(hideTimer);
  });

  // Color y texto del indicador según estado
  $: dot = {
    idle:    { color: '#555',        label: 'Online'           },
    syncing: { color: '#f5a623',     label: 'Sincronizando...' },
    success: { color: '#4ade80',     label: message || 'Sync OK' },
    error:   { color: '#f87171',     label: message || 'Error sync' },
    offline: { color: '#f87171',     label: 'Sin conexión'     },
  }[status];

  // Badge de pendientes
  $: hasPending = pendingCount > 0;
</script>

<div class="sync-bar" class:is-offline={status === 'offline'}>
  <!-- Indicador de estado -->
  <div class="sync-dot-wrap">
    <span class="sync-dot" style="background:{dot.color}; {status === 'syncing' ? 'animation: pulse 1s infinite;' : ''}"></span>
    <span class="sync-label">{dot.label}</span>
  </div>

  <!-- Badge pendientes -->
  {#if hasPending}
    <span class="pending-badge" title="{pendingCount} cambio(s) pendientes de sync">
      ⏳ {pendingCount}
    </span>
  {/if}
</div>

<style>
  .sync-bar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 0;
  }

  .sync-dot-wrap {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .sync-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    transition: background 0.3s;
  }

  .sync-label {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-mid, #a0a0a0);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .is-offline .sync-label {
    color: #f87171;
  }

  .pending-badge {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: #f5a623;
    background: #2a1e00;
    padding: 2px 6px;
    border-radius: 3px;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }
</style>
