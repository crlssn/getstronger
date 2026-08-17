/** @type {import('tailwindcss').Config} */
import forms from '@tailwindcss/forms'

// The design tokens are in src/assets/theme.css, where they are emitted as
// real custom properties: queryable at runtime, overridable per scope, and
// named for the role a value plays rather than the hue it happens to be. The
// achievement orange ramp is gone — records use the record-* tokens (gold on
// champagne). These two ramps remain only until the last champagne-*/gold-*
// call sites move onto those tokens.
const champagne = {
  50: '#fffdf8',
  100: '#fbf4e6',
  200: '#f3e4c8',
  300: '#e8d0a2',
}

const gold = {
  400: '#c69a3a',
  500: '#ad7b1f',
  600: '#8b5f18',
  700: '#6f4815',
}

export default {
  content: ['./index.html', './src/**/*.{html,vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        champagne,
        gold,
      },
    },
  },
  plugins: [forms],
}
