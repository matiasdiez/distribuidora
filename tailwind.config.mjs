/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{astro,html,js,ts,svelte}',
    './public/**/*.html',
  ],

  // El tema oscuro ya lo maneja el sistema de variables CSS en global.css.
  // darkMode: 'class' queda disponible por si se necesita en el futuro.
  darkMode: 'class',

  theme: {
    extend: {
      // ── Colores mapeados a las variables CSS existentes ──────────
      // Permite usar clases como bg-app, text-hi, border-app, etc.
      // manteniendo el sistema de theming dark/light que ya existe.
      colors: {
        // Fondos
        'app':        'var(--bg)',
        'card':       'var(--bg-card)',
        'input':      'var(--bg-input)',

        // Bordes
        'border-app': 'var(--border)',
        'border-hi':  'var(--border-hi)',

        // Texto
        'hi':         'var(--text-hi)',
        'mid':        'var(--text-mid)',
        'lo':         'var(--text-lo)',

        // Acento principal
        'amber':      'var(--amber)',
        'amber-dim':  'var(--amber-dim)',

        // Estado
        'ok':         'var(--green)',
        'ok-dim':     'var(--green-dim)',
        'danger':     'var(--red)',
        'danger-dim': 'var(--red-dim)',
        'info':       'var(--blue)',
      },

      // ── Tipografía ───────────────────────────────────────────────
      fontFamily: {
        ui:   ['var(--font-ui)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },

      // ── Spacing base táctil ──────────────────────────────────────
      // var(--touch) = 58px → target mínimo para uso con guantes
      spacing: {
        'touch': 'var(--touch)',
        'gap':   'var(--gap)',
      },

      // ── Border radius ────────────────────────────────────────────
      borderRadius: {
        'app': 'var(--radius)',
      },

      // ── Alturas de elementos comunes ─────────────────────────────
      height: {
        'touch': 'var(--touch)',
      },
      minHeight: {
        'touch': 'var(--touch)',
      },
    },
  },

  plugins: [],
};
