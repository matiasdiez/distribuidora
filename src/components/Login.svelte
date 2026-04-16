<script lang="ts">
  import { Hexagon, Loader2 } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';
  import { signInWithGoogle } from '../lib/auth';

  const dispatch = createEventDispatcher<{ loginSuccess: void }>();

  let loading = false;
  let error = '';

  async function handleGoogleLogin() {
    loading = true;
    error = '';
    try {
      await signInWithGoogle();
      // El navegador redirige a Google; si vuelve acá es porque algo falló
    } catch (e: any) {
      error = e?.message ?? 'Error al iniciar sesión. Intentá de nuevo.';
      loading = false;
    }
  }
</script>

<div class="login-screen">
  <div class="login-card">
    <div class="login-logo"><Hexagon size={48} strokeWidth={1.5} /></div>
    <h1 class="login-title">DEPÓSITO</h1>
    <p class="login-subtitle">Iniciá sesión para continuar</p>

    {#if error}
      <div class="login-error">{error}</div>
    {/if}

    <button
      class="google-btn"
      on:click={handleGoogleLogin}
      disabled={loading}
    >
      {#if loading}
        <Loader2 size={18} class="spin" />
        Conectando...
      {:else}
        <!-- Google G icon -->
        <svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Iniciar sesión con Google
      {/if}
    </button>

    <p class="login-note">Solo cuentas de Google autorizadas pueden acceder.</p>
  </div>
</div>

<style>
  .login-screen {
    position: fixed;
    inset: 0;
    background: var(--bg, #0d0d0d);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    z-index: 1000;
  }

  .login-card {
    width: 100%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 40px 24px;
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border-hi, #3a3a3a);
    border-radius: 16px;
  }

  .login-logo {
    font-size: 48px;
    color: var(--amber, #f5a623);
    line-height: 1;
  }

  .login-title {
    font-family: var(--font-mono, monospace);
    font-size: 22px;
    font-weight: 700;
    color: var(--text-hi, #f0f0f0);
    letter-spacing: 0.12em;
    margin: 0;
  }

  .login-subtitle {
    font-family: var(--font-ui, sans-serif);
    font-size: 15px;
    color: var(--text-mid, #a0a0a0);
    margin: 0;
    text-align: center;
  }

  .login-error {
    width: 100%;
    padding: 10px 14px;
    background: var(--red-dim, #7f1d1d);
    border: 1px solid var(--red, #f87171);
    border-radius: 8px;
    color: var(--red, #f87171);
    font-size: 14px;
    text-align: center;
  }

  .google-btn {
    width: 100%;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: #fff;
    border: none;
    border-radius: 10px;
    color: #1a1a1a;
    font-family: var(--font-ui, sans-serif);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    -webkit-tap-highlight-color: transparent;
    margin-top: 8px;
  }

  .google-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .google-btn:not(:disabled):active {
    background: #f5f5f5;
  }

  .google-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .login-note {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--text-lo, #555);
    text-align: center;
    margin: 0;
  }

  .spin {
    display: inline-block;
    animation: spin 1s linear infinite;
    font-size: 18px;
  }

  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
</style>
