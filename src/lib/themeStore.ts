/**
 * themeStore.ts — Toggle oscuro/claro
 * Persiste la preferencia en localStorage.
 * Si no hay preferencia guardada, respeta prefers-color-scheme del sistema.
 */

import { writable } from 'svelte/store';

const STORAGE_KEY = 'app_theme';

export type Theme = 'dark' | 'light';

function detectSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return saved ?? detectSystemTheme();
  } catch {
    return detectSystemTheme();
  }
}

export const theme = writable<Theme>('dark');

/** Inicializa el tema desde localStorage y aplica al <html> */
export function initTheme(): void {
  const t = loadTheme();
  theme.set(t);
  applyTheme(t);
}

/** Alterna entre dark y light */
export function toggleTheme(): void {
  theme.update(current => {
    const next: Theme = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    return next;
  });
}

function applyTheme(t: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', t);
}
