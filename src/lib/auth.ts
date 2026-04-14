/**
 * auth.ts — Autenticación con Google via Supabase
 *
 * En desarrollo (`pnpm run dev`) la auth está deshabilitada.
 * En producción (fly.io) exige login con un email de Google
 * que figure en authorized_emails.ts.
 */

import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';
import AUTHORIZED_EMAILS from './authorized_emails';

// True cuando se corre con `pnpm run dev` (Vite establece DEV=true)
export const AUTH_DISABLED: boolean = import.meta.env.DEV;

/** Abre el flujo OAuth de Google. El navegador redirige a Google y vuelve. */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

/** Cierra la sesión actual. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Devuelve la sesión activa, o null si no hay. */
export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Verifica si un email está en la lista de autorizados.
 * La comparación es case-insensitive.
 */
export function isAuthorized(email: string | null | undefined): boolean {
  if (!email) return false;
  return AUTHORIZED_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase());
}
