/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        clay: 'rgb(var(--clay) / <alpha-value>)',
        'clay-dark': 'rgb(var(--clay-dark) / <alpha-value>)',
        cream: 'rgb(var(--cream) / <alpha-value>)',
        'cream-panel': 'rgb(var(--cream-panel) / <alpha-value>)',
        'cream-sunk': 'rgb(var(--cream-sunk) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--ink-soft) / <alpha-value>)',
        'ink-faint': 'rgb(var(--ink-faint) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)'
      },
      fontFamily: {
        serif: ['Georgia', 'Tiempos', 'Times New Roman', 'serif'],
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      }
    }
  },
  plugins: []
}
