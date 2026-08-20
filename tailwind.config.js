/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0a0d14',
        surface: {
          DEFAULT: '#101522',
          light: '#161d2e',
          lighter: '#1e273d',
          border: '#232f48',
        },
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#bcdbff',
          300: '#8ec4ff',
          400: '#58a0ff',
          500: '#2f7cff',
          600: '#185cee',
          700: '#1146cd',
          800: '#1339a5',
          900: '#153382',
        },
        success: {
          DEFAULT: '#10b981',
          dim: '#064e3b',
          glow: 'rgba(16, 185, 129, 0.15)',
        },
        warning: {
          DEFAULT: '#f59e0b',
          dim: '#78350f',
          glow: 'rgba(245, 158, 11, 0.15)',
        },
        danger: {
          DEFAULT: '#ef4444',
          dim: '#7f1d1d',
          glow: 'rgba(239, 68, 68, 0.15)',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-row': 'glowRow 2s ease-out forwards',
      },
      keyframes: {
        glowRow: {
          '0%': { backgroundColor: 'rgba(16, 185, 129, 0.28)', borderColor: '#10b981' },
          '100%': { backgroundColor: 'transparent', borderColor: 'transparent' },
        },
      },
    },
  },
  plugins: [],
}
