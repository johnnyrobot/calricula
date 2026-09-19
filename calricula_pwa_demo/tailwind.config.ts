import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        luminous: {
          50: '#EEF0F4',
          100: '#D9DDE6',
          200: '#B7BECC',
          300: '#8C95A9',
          400: '#5C6880',
          500: '#2C3A57',
          600: '#1F2A44',
          700: '#16203A',
          800: '#111A2E',
          900: '#0C1322',
          950: '#070C16',
        },
        ground: '#F7F3E9',
        surface: '#FCFAF4',
        'surface-2': '#EFE8D6',
        ink: '#1C1B19',
        'ink-2': '#2A2620',
        'ink-soft': '#4A463E',
        muted: '#6B6356',
        hairline: '#D8D0BE',
        'hairline-strong': '#BCB199',
        navy: '#1F2A44',
        'navy-hover': '#16203A',
        'on-primary': '#F4EFE2',
        gold: '#9A7B2E',
        'gold-ink': '#7E6018',
        'gold-soft': '#C9A961',
        seal: {
          approved: '#2F5D45',
          review: '#8A6D1F',
          draft: '#5B5750',
          returned: '#7A2E2E',
        },
      },
      fontFamily: {
        sans: ['Source Sans 3', 'system-ui', 'sans-serif'],
        serif: ['Source Serif 4', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '2px',
        md: '2px',
        lg: '2px',
        xl: '2px',
        '2xl': '3px',
        '3xl': '3px',
      },
      boxShadow: {
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
        inner: 'none',
      },
    },
  },
  plugins: [forms, typography],
};

export default config;
