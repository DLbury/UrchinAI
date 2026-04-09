import typography from '@tailwindcss/typography'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          300: '#9bcafc',
          400: '#79aafc',
          500: '#58a6ff',   /* 极客蓝 accent */
          600: '#3d8bff',
          700: '#1a70ff',
        },
        // ── Semantic tokens backed by CSS variables ────────────────────────
        // Usage: bg-nb-deepest, text-nb-text, border-nb-border, etc.
        // All support opacity modifiers (e.g. bg-nb-card/60) because the
        // variables are stored as space-separated RGB channels.
        nb: {
          deepest:      'rgb(var(--nb-deepest) / <alpha-value>)',
          base:         'rgb(var(--nb-base) / <alpha-value>)',
          card:         'rgb(var(--nb-card) / <alpha-value>)',
          raised:       'rgb(var(--nb-raised) / <alpha-value>)',
          hover:        'rgb(var(--nb-hover) / <alpha-value>)',
          border:       'rgb(var(--nb-border) / <alpha-value>)',
          'border-soft':'rgb(var(--nb-border-soft) / <alpha-value>)',
          text:         'rgb(var(--nb-text) / <alpha-value>)',
          'text-soft':  'rgb(var(--nb-text-soft) / <alpha-value>)',
          'text-dim':   'rgb(var(--nb-text-dim) / <alpha-value>)',
          'text-muted': 'rgb(var(--nb-text-muted) / <alpha-value>)',
        },
        // ── shadcn/ui compatible tokens ─────────────────────────────────────
        // AI SDK Elements uses these
        background: 'rgb(var(--nb-base) / <alpha-value>)',
        foreground: 'rgb(var(--nb-text) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--nb-card) / <alpha-value>)',
          foreground: 'rgb(var(--nb-text) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--nb-raised) / <alpha-value>)',
          foreground: 'rgb(var(--nb-text-soft) / <alpha-value>)',
        },
        border: 'rgb(var(--nb-border) / <alpha-value>)',
        input: 'rgb(var(--nb-raised) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--nb-raised) / <alpha-value>)',
          foreground: 'rgb(var(--nb-text) / <alpha-value>)',
        },
        ring: 'rgb(var(--brand-500) / <alpha-value>)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [
    typography,
  ],
}
