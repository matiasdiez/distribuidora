<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Clock, AlertTriangle, RefreshCw } from 'lucide-svelte';
  import { onSyncStatus, type SyncStatus } from '../lib/sync';
  import { getPendingSync, getDeadLetters } from '../lib/idb';

  let status: SyncStatus = 'idle';
  let message      = '';
  let pendingCount = 0;
  let deadCount    = 0;
  let visible      = false;
  let hideTimer: ReturnType<typeof setTimeout>;
  let unsub: () => void;

  onMount(async () => {
    status = navigator.onLine ? 'idle' : 'offline';
    await refreshCounts();

    unsub = onSyncStatus(async (s, msg) => {
      status  = s;
      message = msg ?? '';
      await refreshCounts();

      if (s === 'success' || s === 'error') {
        visible = true;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          visible = false;
          status  = navigator.onLine ? 'idle' : 'offline';
        }, 3000);
      } else {
        visible = true;
      }
    });
  });

  onDestroy(() => { unsub?.(); clearTimeout(hideTimer); });

  async function refreshCounts() {
    const [p, d] = await Promise.all([getPendingSync(), getDeadLetters()]);
    pendingCount = p.length;
    deadCount    = d.length;
  }

  $: dot = {
    idle:    { color: '#555',    label: 'Online'           },
    syncing: { color: '#f5a623', label: 'Sincronizando...' },
    success: { color: '#4ade80', label: message || 'Sync OK' },
    error:   { color: '#f87171', label: message || 'Error sync' },
    offline: { color: '#f87171', label: 'Sin conexión'     },
  }[status];

  $: hasPending = pendingCount > 0;
  $: hasDead    = deadCount > 0;
</script>

<div class="sync-bar" class:is-offline={status === 'offline'}>
  <div class="sync-dot-wrap">
    <span class="sync-dot" style="background:{dot.color};
      {status === 'syncing' ? 'animation: pulse 1s infinite;' : ''}">
    </span>
    <span class="sync-label">{dot.label}</span>
  </div>

  <!-- Cambios pendientes (normales) -->
  {#if hasPending}
    <span class="pending-badge" title="{pendingCount} cambio(s) pendientes de sync">
      <Clock size={11} strokeWidth={2.5} />{pendingCount}
    </span>
  {/if}

  <!-- Dead letters — errores permanentes que necesitan atención -->
  {#if hasDead}
    <span class="dead-badge" title="{deadCount} cambio(s) no pudieron sincronizarse — ver Ajustes">
      <AlertTriangle size={11} strokeWidth={2.5} />{deadCount}
    </span>
  {/if}
</div>

<style>
  .sync-bar { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  .sync-dot-wrap { display: flex; align-items: center; gap: 5px; }
  .sync-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; transition: background 0.3s; }
  .sync-label { font-family: var(--font-mono); font-size: 10px; color: var(--text-mid); letter-spacing: 0.03em; text-transform: uppercase; white-space: nowrap; }
  .is-offline .sync-label { color: #f87171; }

  .pending-badge {
    display: inline-flex; align-items: center; gap: 3px;
    font-family: var(--font-mono); font-size: 10px;
    color: var(--amber); background: var(--amber-bg, #2a1e00);
    padding: 2px 6px; border-radius: 3px;
  }
  .dead-badge {
    display: inline-flex; align-items: center; gap: 3px;
    font-family: var(--font-mono); font-size: 10px;
    color: var(--red, #f87171); background: #2a0a0a;
    padding: 2px 6px; border-radius: 3px;
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
</style>
