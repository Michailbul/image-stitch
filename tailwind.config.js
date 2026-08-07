/** @type {import('tailwindcss').Config} */
// Lifted verbatim from the inline `tailwind.config` that used to sit in a
// <script> tag in index.html, back when Tailwind was loaded from
// cdn.tailwindcss.com and compiled in the browser on every page load. The
// theme is unchanged on purpose — this move is about when the CSS is built,
// not what it contains.
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './views/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-background)',
        surface: 'var(--bg-surface)',
        border: 'var(--border-color)',
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        accent: 'var(--color-accent)',
        accentDim: 'var(--color-accent-dim)',
        inverse: 'var(--bg-inverse)',
        inverseText: 'var(--text-inverse)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['DM Serif Display', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        sharp: 'var(--shadow-sharp)',
        elevated: 'var(--shadow-elevated)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(15px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
};
