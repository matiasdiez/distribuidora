/**
 * depotStore.ts — Estado global del depósito activo
 *
 * Persiste la selección en localStorage para que al reabrir la app
 * el usuario entre directo a su depósito sin pasar por el selector.
 */

import { writable, get } from 'svelte/store';
import type { Depot } from './supabase';

const STORAGE_KEY = 'active_depot';

// ── Store ─────────────────────────────────────────────────────

/** Depósito actualmente activo, o null si no se eligió ninguno */
export const activeDepot = writable<Depot | null>(null);

// ── Persistencia ───────────────────────────────────────────────

/** Lee el depósito guardado en localStorage y lo carga al store */
export function loadSavedDepot(): Depot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const depot = JSON.parse(raw) as Depot;
    activeDepot.set(depot);
    return depot;
  } catch {
    return null;
  }
}

/** Establece el depósito activo y lo persiste */
export function setActiveDepot(depot: Depot): void {
  activeDepot.set(depot);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(depot));
  } catch {
    // En caso de que localStorage no esté disponible (privado, etc.)
  }
}

/** Borra la selección de depósito (vuelve al selector) */
export function clearActiveDepot(): void {
  activeDepot.set(null);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** Helper para leer el valor actual del store sincrónicamente */
export function getActiveDepot(): Depot | null {
  return get(activeDepot);
}
