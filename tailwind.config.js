/** @type {import('tailwindcss').Config} */
const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Operational Intelligence Surface Colors
        surface: {
          0: withAlpha('--surface-0'),
          1: withAlpha('--surface-1'),
          2: withAlpha('--surface-2'),
          3: withAlpha('--surface-3'),
          4: withAlpha('--surface-4'),
        },
        // Deep Space Background Colors
        bg: {
          primary: withAlpha('--bg-primary'),
          secondary: withAlpha('--bg-secondary'),
          tertiary: withAlpha('--bg-tertiary'),
        },
        // Border Colors
        'oi-border': {
          DEFAULT: withAlpha('--border-default'),
          subtle: withAlpha('--border-subtle'),
          hover: withAlpha('--border-hover'),
        },
        border: {
          subtle: withAlpha('--border-subtle'),
          active: withAlpha('--border-active'),
        },
        // Accent Colors (functional)
        accent: {
          green: withAlpha('--accent-green'),
          red: withAlpha('--accent-red'),
          blue: withAlpha('--accent-blue'),
          amber: withAlpha('--accent-amber'),
          purple: withAlpha('--accent-purple'),
          cyan: withAlpha('--accent-cyan'),
          orange: withAlpha('--accent-orange'),
        },
        // Text Colors
        textc: {
          primary: withAlpha('--text-primary'),
          secondary: withAlpha('--text-secondary'),
          muted: withAlpha('--text-muted'),
          selection: withAlpha('--selection-orange'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 20px rgba(34, 197, 94, 0.2)',
        'glow-red': '0 0 20px rgba(239, 68, 68, 0.2)',
        'glow-blue': '0 0 20px rgba(59, 130, 246, 0.2)',
        'glow-amber': '0 0 20px rgba(245, 158, 11, 0.2)',
        'glass': '0 10px 40px rgba(0,0,0,0.5)',
      },
      borderRadius: {
        'md': '6px',
        'lg': '10px',
        '2xl': '16px',
      },
      spacing: {
        'panel-pad': '16px',
      },
      animation: {
        'pulse-slow': 'pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
