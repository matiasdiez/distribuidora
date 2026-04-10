/**
 * sync.ts — Motor de sincronización offline-first
 *
 * Responsabilidades:
 *  1. Sync inicial: descarga productos + stock de Supabase → IndexedDB
 *  2. Sync de cambios: sube pending_sync a Supabase cuando hay conexión
 *  3. Detecta cambios de conectividad y reintenta automáticamente
 */

import {
  saveProducts,
  saveStockEntries,
  saveDepots,
  setMeta,
  getMeta,
  isInitialized,
  getPendingSync,
  clearPendingSync,
} from './idb';

import {
  fetchAllProducts,
  fetchAllStock,
  fetchDepots,
  upsertStockEntry,
} from './supabase';

/**
 * Versión de los datos locales.
 * Incrementar este número fuerza un re-sync completo en todos los dispositivos,
 * incluso si los datos en IndexedDB parecen frescos (< 24h).
 * Usar cuando cambie la lógica de fetching o el schema de datos.
 */
const DATA_VERSION = '2';  // ← incrementar si cambia fetch/schema

// Evento custom que los componentes Svelte pueden escuchar
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

type SyncListener = (status: SyncStatus, message?: string) => void;
const listeners: Set<SyncListener> = new Set();

export function onSyncStatus(fn: SyncListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);  // devuelve unsubscribe
}

function emit(status: SyncStatus, message?: string) {
  listeners.forEach(fn => fn(status, message));
}


// ── Sync inicial ──────────────────────────────────────────────

/**
 * Descarga todos los datos de Supabase y los guarda en IndexedDB.
 * Solo se llama una vez (o al forzar refresh).
 */
export async function initialSync(depotId: number = 1): Promise<void> {
  if (!navigator.onLine) {
    emit('offline', 'Sin conexión para sync inicial');
    return;
  }

  // Verificar si ya está inicializado, los datos son recientes Y la versión coincide
  if (await isInitialized()) {
    const lastSync    = await getMeta('last_sync');
    const dataVersion = await getMeta('data_version');
    const versionOk   = dataVersion === DATA_VERSION;

    if (lastSync && versionOk) {
      const hoursSince = (Date.now() - new Date(lastSync).getTime()) / 36e5;
      if (hoursSince < 24) {
        // Datos frescos y versión correcta, no es necesario re-sync
        emit('idle');
        return;
      }
    }
    // Si la versión no coincide, forzamos re-sync aunque los datos sean frescos
    if (!versionOk) {
      console.log(`[sync] versión de datos cambió (${dataVersion} → ${DATA_VERSION}), forzando re-sync`);
    }
  }

  emit('syncing', 'Descargando productos...');

  try {
    const [products, depots] = await Promise.all([
      fetchAllProducts(),
      fetchDepots(),
    ]);

    await saveDepots(depots);
    await saveProducts(products);

    emit('syncing', 'Descargando stock...');

    // Descarga TODO el stock de todos los depósitos de una sola vez.
    // Así al cambiar de depósito no hace falta un nuevo request de red.
    const stock = await fetchAllStock();
    await saveStockEntries(stock);

    await setMeta('initialized',  'true');
    await setMeta('last_sync',     new Date().toISOString());
    await setMeta('data_version',  DATA_VERSION);

    emit('success', `${products.length} productos sincronizados`);
  } catch (err) {
    console.error('[sync] initialSync error:', err);
    emit('error', 'Error al sincronizar. Usá los datos locales.');
  }
}


// ── Sync de cambios pendientes ────────────────────────────────

/**
 * Sube los cambios locales pendientes a Supabase.
 * Se llama automáticamente al detectar conexión.
 */
export async function syncPending(): Promise<void> {
  if (!navigator.onLine) return;

  const pending = await getPendingSync();
  if (pending.length === 0) return;

  emit('syncing', `Sincronizando ${pending.length} cambio(s)...`);

  const synced: number[] = [];

  for (const item of pending) {
    try {
      if (item.type === 'stock_upsert') {
        await upsertStockEntry(item.payload);
        if (item.id) synced.push(item.id);
      }
    } catch (err) {
      console.error('[sync] failed to sync item:', item, err);
      // No cortamos el loop — intentamos los demás
    }
  }

  if (synced.length > 0) {
    await clearPendingSync(synced);
  }

  const remaining = pending.length - synced.length;
  if (remaining === 0) {
    emit('success', 'Todo sincronizado ✓');
  } else {
    emit('error', `${remaining} cambio(s) no sincronizados`);
  }
}


// ── Listeners de conectividad ─────────────────────────────────

/**
 * Registra listeners de online/offline en el navegador.
 * Llamar una sola vez al montar la app.
 */
export function initConnectivityListeners(depotId: number = 1): () => void {
  const handleOnline = async () => {
    console.log('[sync] conexión restaurada');
    await syncPending();
  };

  const handleOffline = () => {
    emit('offline', 'Sin conexión — modo local activo');
  };

  window.addEventListener('online',  handleOnline);
  window.addEventListener('offline', handleOffline);

  // Retorna función para limpiar listeners (útil en onDestroy de Svelte)
  return () => {
    window.removeEventListener('online',  handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}


// ── Utilidad: estado de conexión ──────────────────────────────

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : false;
}
