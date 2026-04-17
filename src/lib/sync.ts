/**
 * sync.ts — Motor de sincronización offline-first
 *
 * Responsabilidades:
 *  1. Sync inicial: descarga productos + stock de Supabase → IndexedDB
 *  2. Sync de cambios: sube pending_sync a Supabase cuando hay conexión
 *  3. Detecta cambios de conectividad y reintenta automáticamente
 *  4. Sync programado a las 7:30 AM hora Buenos Aires (UTC-3, sin DST)
 */

import {
  saveProducts, saveStockEntries, saveDepots,
  setMeta, getMeta, isInitialized,
  getPendingSync, clearPendingSync,
  saveSubDepots, saveBrandNotesFromRemote, updateBrandNote,
} from './idb';

import {
  fetchAllProducts, fetchStockByDepot, fetchDepots,
  upsertStockEntry, upsertStockWithHistory,
  fetchSubDepots, fetchBrandNotes,
  upsertBrandNote, deleteBrandNoteRemote,
  assignProductsToSubDepot, createSubDepot,
} from './supabase';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

type SyncListener = (status: SyncStatus, message?: string) => void;
const listeners: Set<SyncListener> = new Set();

export function onSyncStatus(fn: SyncListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(status: SyncStatus, message?: string) {
  listeners.forEach(fn => fn(status, message));
}


// ── Sync inicial ──────────────────────────────────────────────

export async function initialSync(depotId: number = 1, force = false): Promise<void> {
  if (!navigator.onLine) {
    emit('offline', 'Sin conexión para sync inicial');
    return;
  }

  if (!force && await isInitialized()) {
    const lastSync = await getMeta('last_sync');
    if (lastSync) {
      const hoursSince = (Date.now() - new Date(lastSync).getTime()) / 36e5;
      if (hoursSince < 24) {
        emit('idle');
        return;
      }
    }
  }

  emit('syncing', 'Descargando productos...');

  try {
    const [products, depots, subDepots, brandNotes] = await Promise.all([
      fetchAllProducts(), fetchDepots(), fetchSubDepots(), fetchBrandNotes(),
    ]);
    await saveDepots(depots);
    await saveSubDepots(subDepots);
    await saveProducts(products);

    emit('syncing', 'Descargando stock...');
    const stock = await fetchStockByDepot(depotId);
    await saveStockEntries(stock);

    // Guardar notas remotas localmente (merge: priorizar remoto)
    await saveBrandNotesFromRemote(
      brandNotes.map(n => ({ ...n, remote_id: n.id }))
    );

    await setMeta('initialized', 'true');
    await setMeta('last_sync', new Date().toISOString());
    // Registrar la fecha (Buenos Aires) de la última sync diaria
    await setMeta('last_daily_sync_date', getBADateString());

    emit('success', `${products.length} productos sincronizados`);
  } catch (err) {
    console.error('[sync] initialSync error:', err);
    emit('error', 'Error al sincronizar. Usá los datos locales.');
  }
}


// ── Sync de cambios pendientes ────────────────────────────────

export async function syncPending(): Promise<void> {
  if (!navigator.onLine) return;

  const pending = await getPendingSync();
  if (pending.length === 0) return;

  emit('syncing', `Sincronizando ${pending.length} cambio(s)...`);
  const synced: number[] = [];

  for (const item of pending) {
    try {
      if (item.type === 'stock_upsert') {
        // Si el payload lleva _history, usar la RPC atómica que guarda
        // stock_entries + stock_history en una sola transacción.
        // Si no (lote nuevo), usar el upsert simple.
        if ((item.payload as any)._history) {
          await upsertStockWithHistory(item.payload as any);
        } else {
          await upsertStockEntry(item.payload);
        }
        if (item.id) synced.push(item.id);
      } else if (item.type === 'depot_assignment') {
        const { assignProductsToDepot } = await import('./supabase');
        await assignProductsToDepot(item.payload.product_ids, item.payload.depot_id);
        if (item.id) synced.push(item.id);
      } else if (item.type === 'depot_create') {
        const { createDepot } = await import('./supabase');
        const { saveDepots, getDepots } = await import('./idb');
        const newDepot = await createDepot(item.payload.name);
        const depots = await getDepots();
        const updated = depots.map(d => d.id === item.payload.temp_id ? { ...d, id: newDepot.id } : d);
        await saveDepots(updated);
        if (item.id) synced.push(item.id);

      } else if (item.type === 'brand_note_upsert') {
        const p = item.payload;
        const remote = await upsertBrandNote({
          id:       p.remote_id,
          brand:    p.brand,
          content:  p.content,
          status:   p.status,
          priority: p.priority,
          due_date: p.due_date,
        });
        // Guardar el remote_id asignado por Supabase en el registro local
        if (p.id) await updateBrandNote(p.id, { remote_id: remote.id });
        if (item.id) synced.push(item.id);

      } else if (item.type === 'brand_note_delete') {
        await deleteBrandNoteRemote(item.payload.remote_id);
        if (item.id) synced.push(item.id);

      } else if (item.type === 'sub_depot_create') {
        const newSub = await createSubDepot(item.payload.depot_id, item.payload.name);
        const { saveSubDepots, getSubDepots } = await import('./idb');
        const subs = await getSubDepots();
        const updated = subs.map(s => s.id === item.payload.temp_id ? { ...s, id: newSub.id } : s);
        await saveSubDepots(updated);
        if (item.id) synced.push(item.id);

      } else if (item.type === 'product_sub_depot_assign') {
        await assignProductsToSubDepot(
          item.payload.product_ids,
          item.payload.sub_depot_id,
        );
        if (item.id) synced.push(item.id);
      }
    } catch (err) {
      console.error('[sync] failed to sync item:', item, err);
    }
  }

  if (synced.length > 0) await clearPendingSync(synced);

  const remaining = pending.length - synced.length;
  if (remaining === 0) {
    emit('success', 'Todo sincronizado ✓');
  } else {
    emit('error', `${remaining} cambio(s) no sincronizados`);
  }
}


// ── Listeners de conectividad ─────────────────────────────────

export function initConnectivityListeners(depotId: number = 1): () => void {
  const handleOnline = async () => {
    console.log('[sync] conexión restaurada');
    await syncPending();
  };
  const handleOffline = () => {
    emit('offline', 'Sin conexión — modo local activo');
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Al iniciar, si ya hay conexión, subir cambios pendientes inmediatamente
  if (navigator.onLine) {
    syncPending().catch(console.error);
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : false;
}


// ── Sync programado a las 7:30 AM hora Buenos Aires ──────────
// Argentina es UTC-3 todo el año (no tiene horario de verano desde 2008)

const SYNC_HOUR_UTC = 10;   // 7:30 AM ART = 10:30 UTC
const SYNC_MINUTE_UTC = 30;

function msUntilNext7_30BA(): number {
  const now = new Date();
  const todaySync = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    SYNC_HOUR_UTC, SYNC_MINUTE_UTC, 0, 0,
  ));
  if (now >= todaySync) {
    todaySync.setUTCDate(todaySync.getUTCDate() + 1);
  }
  return todaySync.getTime() - now.getTime();
}

/** Fecha actual en Buenos Aires, formato "YYYY-MM-DD" */
function getBADateString(): string {
  return new Date(Date.now() - 3 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}

let _dailySyncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Programa la sync diaria a las 7:30 AM Buenos Aires.
 * Llama a syncPending() primero (sube cambios), luego initialSync(force=true).
 * Retorna función para cancelar el timer.
 */
export function scheduleDailySync(depotId: number = 1): () => void {
  function schedule() {
    const ms = msUntilNext7_30BA();
    console.log(`[sync] próxima sync diaria en ${Math.round(ms / 60000)} min`);
    _dailySyncTimer = setTimeout(async () => {
      console.log('[sync] ejecutando sync diaria 7:30 AM BA');
      if (navigator.onLine) {
        await syncPending();
        await initialSync(depotId, true);
      }
      schedule(); // reprogramar para el día siguiente
    }, ms);
  }
  schedule();
  return () => { if (_dailySyncTimer) clearTimeout(_dailySyncTimer); };
}

/**
 * Verifica si la sync matutina de HOY ya se hizo.
 * Retorna true si ya fue sincronizado esta mañana (después de las 7:30 BA).
 * Se usa para mostrar el banner de aviso en la app.
 */
export async function isMorningSyncDone(): Promise<boolean> {
  const lastDate = await getMeta('last_daily_sync_date');
  if (!lastDate) return false;
  const todayBA = getBADateString();
  if (lastDate !== todayBA) return false;
  // Verificar que ya pasaron las 7:30 BA
  const nowUTC = new Date();
  const syncTimeUTC = new Date(Date.UTC(
    nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate(),
    SYNC_HOUR_UTC, SYNC_MINUTE_UTC,
  ));
  return nowUTC >= syncTimeUTC;
}
