<script lang="ts">
  import { onMount } from 'svelte';
  import { Hexagon, ArrowLeft, Check } from "lucide-svelte";
  import {
    loadThresholds,
    saveThresholds,
    DEFAULT_THRESHOLDS,
    FRESHNESS_COLORS,
    calcFreshness,
    type FreshnessThresholds,
  } from '../lib/freshness';
  import FreshnessDot from './FreshnessDot.svelte';

  let thresholds: FreshnessThresholds = { ...DEFAULT_THRESHOLDS };
  let saved  = false;
  let saving = false;
  let error  = '';

  onMount(async () => {
    thresholds = await loadThresholds();
  });

  async function handleSave() {
    error = '';

    // Validar orden lógico
    if (thresholds.green_days <= 0) {
      error = 'Verde debe ser mayor a 0 días.'; return;
    }
    if (thresholds.yellow_days <= thresholds.green_days) {
      error = 'Amarillo debe ser mayor que verde.'; return;
    }
    if (thresholds.orange_days <= thresholds.yellow_days) {
      error = 'Naranja debe ser mayor que amarillo.'; return;
    }

    saving = true;
    try {
      await saveThresholds(thresholds);
      saved = true;
      setTimeout(() => { saved = false; }, 2500);
    } finally {
      saving = false;
    }
  }

  function reset() {
    thresholds = { ...DEFAULT_THRESHOLDS };
  }

  // Previsualización dinámica basada en los umbrales actuales
  $: previews = [
    { days: 0,                      label: 'Hoy' },
    { days: thresholds.green_days,  label: `${thresholds.green_days}d atrás` },
    { days: thresholds.yellow_days, label: `${thresholds.yellow_days}d atrás` },
    { days: thresholds.orange_days, label: `${thresholds.orange_days}d atrás` },
    { days: null,                   label: 'Sin registros' },
  ].map(({ days, label }) => {
    const date = days != null
      ? new Date(Date.now() - days * 86400000)
      : null;
    const result = calcFreshness(date, thresholds);
    return { label, result };
  });
</script>

<div class="settings-app">

  <!-- Header -->
  <header class="app-header">
    <div class="header-left">
      <a href="/" class="back-link" aria-label="Volver"><ArrowLeft size={18} strokeWidth={2} /></a>
      <div class="app-logo"><Hexagon size={14} strokeWidth={2.5} /> AJUSTES</div>
    </div>
  </header>

  <div class="settings-body">

    <!-- ── Sección frescura ── -->
    <section class="section">
      <h2 class="section-title">Indicadores de stock</h2>
      <p class="section-desc">
        Cada producto muestra un punto de color según cuándo se registró
        stock por última vez. Configurá los umbrales en días.
      </p>

      <!-- Previsualización -->
      <div class="preview-block">
        <p class="preview-label">Vista previa con tus valores</p>
        <div class="preview-list">
          {#each previews as { label, result }}
            <div class="preview-row">
              <FreshnessDot status={result.status} label={result.label} size="md" />
              <span class="preview-date">{label}</span>
              <span class="preview-status" style="color:{FRESHNESS_COLORS[result.status]}">
                {result.label}
              </span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Controles -->
      <div class="thresholds">

        <div class="threshold-row">
          <div class="threshold-info">
            <span class="t-dot" style="background:{FRESHNESS_COLORS.green}"></span>
            <div>
              <span class="t-name">Verde</span>
              <span class="t-desc">Stock al día</span>
            </div>
          </div>
          <div class="t-input-wrap">
            <span class="t-prefix">hasta</span>
            <input
              type="number"
              class="t-input"
              min="1"
              max="30"
              bind:value={thresholds.green_days}
            />
            <span class="t-suffix">días</span>
          </div>
        </div>

        <div class="threshold-row">
          <div class="threshold-info">
            <span class="t-dot" style="background:{FRESHNESS_COLORS.yellow}"></span>
            <div>
              <span class="t-name">Amarillo</span>
              <span class="t-desc">Revisar pronto</span>
            </div>
          </div>
          <div class="t-input-wrap">
            <span class="t-prefix">hasta</span>
            <input
              type="number"
              class="t-input"
              min="2"
              max="60"
              bind:value={thresholds.yellow_days}
            />
            <span class="t-suffix">días</span>
          </div>
        </div>

        <div class="threshold-row">
          <div class="threshold-info">
            <span class="t-dot" style="background:{FRESHNESS_COLORS.orange}"></span>
            <div>
              <span class="t-name">Naranja</span>
              <span class="t-desc">Desactualizado</span>
            </div>
          </div>
          <div class="t-input-wrap">
            <span class="t-prefix">hasta</span>
            <input
              type="number"
              class="t-input"
              min="3"
              max="90"
              bind:value={thresholds.orange_days}
            />
            <span class="t-suffix">días</span>
          </div>
        </div>

        <div class="threshold-row threshold-row--static">
          <div class="threshold-info">
            <span class="t-dot" style="background:{FRESHNESS_COLORS.red}"></span>
            <div>
              <span class="t-name">Rojo</span>
              <span class="t-desc">Sin registros o muy desactualizado</span>
            </div>
          </div>
          <span class="t-static">automático</span>
        </div>

      </div>

      {#if error}
        <p class="error-msg">{error}</p>
      {/if}

      <!-- Acciones -->
      <div class="actions">
        <button class="btn-reset" on:click={reset}>
          Restablecer
        </button>
        <button
          class="btn-save"
          on:click={handleSave}
          disabled={saving}
        >
          {#if saved}
            <Check size={13} strokeWidth={3} /> Guardado
          {:else if saving}
            Guardando...
          {:else}
            Guardar
          {/if}
        </button>
      </div>
    </section>

    <!-- ── Info adicional ── -->
    <section class="section section--info">
      <h2 class="section-title">Cómo funciona</h2>
      <div class="info-list">
        <div class="info-row">
          <FreshnessDot status="green" size="sm" />
          <span>El punto aparece en cada producto en la búsqueda y en cada marca en la vista de swipe.</span>
        </div>
        <div class="info-row">
          <FreshnessDot status="orange" size="sm" />
          <span>En la vista de marcas, el color representa el producto con stock más desactualizado de esa marca.</span>
        </div>
        <div class="info-row">
          <FreshnessDot status="red" size="sm" />
          <span>Rojo siempre significa que nunca se registró stock o que superó el umbral naranja.</span>
        </div>
      </div>
    </section>

  </div>
</div>

<style>
  .settings-app {
    min-height: 100dvh;
    background: var(--bg, #0d0d0d);
    color: var(--text-hi, #f0f0f0);
    font-family: var(--font-ui, 'Barlow Condensed', sans-serif);
    display: flex;
    flex-direction: column;
  }

  .app-header {
    display: flex;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border, #2a2a2a);
    position: sticky;
    top: 0;
    background: var(--bg, #0d0d0d);
    z-index: 100;
  }

  .header-left { display: flex; align-items: center; gap: 10px; }

  .back-link {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid var(--border, #2a2a2a);
    background: var(--bg-card, #1a1a1a);
    color: var(--text-hi, #f0f0f0);
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
  }

  .app-logo {
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: var(--amber, #f5a623);
    letter-spacing: 0.05em;
  }

  .settings-body {
    flex: 1;
    padding: 0 0 40px;
    overflow-y: auto;
  }

  /* Secciones */
  .section {
    padding: 20px 16px;
    border-bottom: 1px solid var(--border, #2a2a2a);
  }

  .section--info { border-bottom: none; }

  .section-title {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--amber, #f5a623);
    margin-bottom: 6px;
  }

  .section-desc {
    font-size: 15px;
    color: var(--text-mid, #a0a0a0);
    line-height: 1.4;
    margin-bottom: 16px;
  }

  /* Preview */
  .preview-block {
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 16px;
  }

  .preview-label {
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-lo, #555);
    margin-bottom: 10px;
  }

  .preview-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .preview-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .preview-date {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    color: var(--text-mid, #a0a0a0);
    flex: 1;
  }

  .preview-status {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* Umbrales */
  .thresholds {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .threshold-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 6px;
  }

  .threshold-row--static {
    opacity: 0.6;
  }

  .threshold-info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
  }

  .t-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .t-name {
    display: block;
    font-family: var(--font-ui, sans-serif);
    font-size: 17px;
    font-weight: 700;
    color: var(--text-hi, #f0f0f0);
    line-height: 1;
  }

  .t-desc {
    display: block;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-lo, #555);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-top: 2px;
  }

  .t-input-wrap {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }

  .t-prefix, .t-suffix {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-lo, #555);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .t-input {
    width: 52px;
    height: 38px;
    background: var(--bg, #0d0d0d);
    border: 1.5px solid var(--border-hi, #3a3a3a);
    border-radius: 6px;
    color: var(--text-hi, #f0f0f0);
    font-family: var(--font-mono, monospace);
    font-size: 20px;
    font-weight: 700;
    text-align: center;
    outline: none;
    transition: border-color 0.15s;
  }

  .t-input:focus { border-color: var(--amber, #f5a623); }
  .t-input::-webkit-inner-spin-button,
  .t-input::-webkit-outer-spin-button { -webkit-appearance: none; }

  .t-static {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-lo, #555);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }

  .error-msg {
    margin-top: 10px;
    padding: 8px 12px;
    background: var(--red-dim, #7f1d1d);
    color: var(--red, #f87171);
    border-radius: 6px;
    font-size: 14px;
  }

  /* Acciones */
  .actions {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 8px;
    margin-top: 16px;
  }

  .btn-reset {
    height: 48px;
    border-radius: 7px;
    border: 1px solid var(--border-hi, #3a3a3a);
    background: var(--bg-card, #1a1a1a);
    color: var(--text-mid, #a0a0a0);
    font-family: var(--font-ui, sans-serif);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .btn-save {
    height: 48px;
    border-radius: 7px;
    border: none;
    background: var(--amber, #f5a623);
    color: #000;
    font-family: var(--font-ui, sans-serif);
    font-size: 17px;
    font-weight: 700;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: opacity 0.15s;
  }

  .btn-save:disabled { opacity: 0.6; }

  /* Info */
  .info-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .info-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding-top: 2px;
  }

  .info-row span:last-child {
    font-size: 14px;
    color: var(--text-mid, #a0a0a0);
    line-height: 1.4;
  }
</style>
