/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
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
      },
    },
  },
  plugins: [],
}
