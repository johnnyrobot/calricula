import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Light-only academic theme. `dark` class is never applied (see ThemeContext),
  // so any remaining `dark:` utilities are inert.
  darkMode: 'class',
  theme: {
    extend: {
      // ===========================================
      // Academic ("catalog of record") palette
      // ===========================================
      // The `luminous` scale is retained by name so existing utilities
      // (text-luminous-600, bg-luminous-50, ring-luminous-500, ...) keep
      // working — but it is repointed from indigo to the navy crest ramp.
      colors: {
        luminous: {
          50: '#EEF0F4',
          100: '#D9DDE6',
          200: '#B7BECC',
          300: '#8C95A9',
          400: '#5C6880',
          500: '#2C3A57',
          600: '#1F2A44', // navy crest / primary
          700: '#16203A', // navy hover
          800: '#111A2E',
          900: '#0C1322',
          950: '#070C16',
        },
        // Semantic academic tokens (mirror the CSS vars in globals.css)
        ground: '#F7F3E9', // parchment page
        surface: '#FCFAF4', // paper panel
        'surface-2': '#EFE8D6',
        ink: '#1C1B19', // primary text
        'ink-2': '#2A2620',
        'ink-soft': '#4A463E', // warm gray secondary
        muted: '#6B6356',
        hairline: '#D8D0BE',
        'hairline-strong': '#BCB199',
        navy: '#1F2A44',
        'navy-hover': '#16203A',
        'on-primary': '#F4EFE2',
        gold: '#9A7B2E', // decorative rules/accents (meets 3:1 non-text bar)
        'gold-ink': '#7E6018', // AA-safe gold for small text on parchment (~5.3:1)
        'gold-soft': '#C9A961',
        // Status "seals"
        seal: {
          approved: '#2F5D45',
          review: '#8A6D1F',
          draft: '#5B5750',
          returned: '#7A2E2E',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        serif: ['Source Serif 4', 'Georgia', 'serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      // Squared corners (radius 0–3px). Overrides the rounded utilities the
      // app already uses (rounded-lg/-xl) so nothing reads as a SaaS card.
      // `rounded-full` is preserved for genuine circles (avatars, spinners).
      borderRadius: {
        none: '0px',
        sm: '2px',
        DEFAULT: '2px',
        md: '2px',
        lg: '2px',
        xl: '2px',
        '2xl': '3px',
        '3xl': '3px',
      },
      // No drop shadows — hairline rules do all separation.
      boxShadow: {
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
        inner: 'none',
      },
      // Flat navy masthead/sidebar (no gradient).
      backgroundImage: {
        'luminous-gradient': 'linear-gradient(#1F2A44, #1F2A44)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};

export default config;
