/**
 * freshness.ts — Motor de frescura de stock
 *
 * Cuatro estados:
 *   green  → stock actualizado hace menos de green_days
 *   yellow → entre green_days y yellow_days
 *   orange → entre yellow_days y orange_days
 *   red    → nunca se registró stock (date = null) o más de orange_days
 */

import { getMeta, setMeta } from './idb';

// ── Tipos ─────────────────────────────────────────────────────────────────

export type FreshnessStatus = 'green' | 'yellow' | 'orange' | 'red';

export interface FreshnessThresholds {
  green_days:  number;   // hasta aquí → verde  (default 3)
  yellow_days: number;   // hasta aquí → amarillo (default 7)
  orange_days: number;   // hasta aquí → naranja  (default 14)
                         // más que esto o nunca → rojo
}

export interface FreshnessResult {
  status:   FreshnessStatus;
  daysSince: number | null;   // null si nunca
  label:    string;
}

// ── Defaults ──────────────────────────────────────────────────────────────

export const DEFAULT_THRESHOLDS: FreshnessThresholds = {
  green_days:  3,
  yellow_days: 7,
  orange_days: 14,
};

// ── Persistencia en IndexedDB meta ────────────────────────────────────────

export async function loadThresholds(): Promise<FreshnessThresholds> {
  const raw = await getMeta('freshness_thresholds');
  if (!raw) return { ...DEFAULT_THRESHOLDS };
  try {
    return JSON.parse(raw) as FreshnessThresholds;
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

export async function saveThresholds(t: FreshnessThresholds): Promise<void> {
  await setMeta('freshness_thresholds', JSON.stringify(t));
}

// ── Cálculo ───────────────────────────────────────────────────────────────

export function calcFreshness(
  lastUpdate: Date | null,
  thresholds: FreshnessThresholds
): FreshnessResult {
  if (!lastUpdate) {
    return { status: 'red', daysSince: null, label: 'Sin registros' };
  }

  const now      = Date.now();
  const ms       = now - lastUpdate.getTime();
  const days     = ms / (1000 * 60 * 60 * 24);
  const daysSince = Math.floor(days);

  let status: FreshnessStatus;
  let label: string;

  if (days <= thresholds.green_days) {
    status = 'green';
    label  = daysSince === 0 ? 'Hoy' : `Hace ${daysSince}d`;
  } else if (days <= thresholds.yellow_days) {
    status = 'yellow';
    label  = `Hace ${daysSince}d`;
  } else if (days <= thresholds.orange_days) {
    status = 'orange';
    label  = `Hace ${daysSince}d`;
  } else {
    status = 'red';
    label  = `Hace ${daysSince}d`;
  }

  return { status, daysSince, label };
}

// ── Color CSS por estado ──────────────────────────────────────────────────

export const FRESHNESS_COLORS: Record<FreshnessStatus, string> = {
  green:  '#4ade80',
  yellow: '#facc15',
  orange: '#fb923c',
  red:    '#f87171',
};

export const FRESHNESS_BG: Record<FreshnessStatus, string> = {
  green:  '#166534',
  yellow: '#713f12',
  orange: '#7c2d12',
  red:    '#7f1d1d',
};

export const FRESHNESS_LABELS: Record<FreshnessStatus, string> = {
  green:  'Al día',
  yellow: 'Revisar',
  orange: 'Desactualizado',
  red:    'Sin stock',
};

// ── Comparador para "peor estado" de una marca ────────────────────────────

const STATUS_ORDER: Record<FreshnessStatus, number> = {
  green: 0, yellow: 1, orange: 2, red: 3,
};

export function worstStatus(statuses: FreshnessStatus[]): FreshnessStatus {
  if (statuses.length === 0) return 'red';
  return statuses.reduce((worst, s) =>
    STATUS_ORDER[s] > STATUS_ORDER[worst] ? s : worst
  );
}
