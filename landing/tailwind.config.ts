import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: '#0a0a0a',
          secondary: '#121212',
          elevated: '#1a1a1a',
          card: '#1e1e1e',
        },
        primary: {
          DEFAULT: '#6366f1',
          hover: '#818cf8',
          subtle: 'rgba(99, 102, 241, 0.1)',
        },
        purple: {
          DEFAULT: '#8b5cf6',
          subtle: 'rgba(139, 92, 246, 0.1)',
        },
        cyan: {
          DEFAULT: '#22d3ee',
          subtle: 'rgba(34, 211, 238, 0.08)',
        },
        text: {
          primary: '#fafafa',
          secondary: '#a1a1aa',
          muted: '#71717a',
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.06)',
          hover: 'rgba(255, 255, 255, 0.1)',
        },
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'float-slow': 'float 8s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'spin-slow': 'spin 20s linear infinite',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.6s ease-out forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(40px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-glow': 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(99, 102, 241, 0.12) 0%, transparent 70%)',
        'feature-glow': 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(139, 92, 246, 0.06) 0%, transparent 70%)',
      },
    },
  },
  plugins: [],
} satisfies Config;
