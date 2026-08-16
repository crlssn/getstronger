/** @type {import('tailwindcss').Config} */
import forms from '@tailwindcss/forms'

// What is left here is the identity's ramps, under names that are true.
//
// The graphite scale used to be aliased as `indigo`, `violet` and `primary`,
// and the achievement scale as `amber` — so a developer reaching for "a bit of
// colour" typed text-indigo-700, got charcoal, decided it looked fine, and
// moved on. The name taught them nothing. Graphite now lives in theme.css as
// role-named tokens (--color-ink and its tints); the aliases are gone.
//
// The design tokens themselves are in src/assets/theme.css, where they are
// emitted as real custom properties. Only scales that genuinely need every step
// belong here.
const achievement = {
  50: '#fff4ed',
  100: '#ffe4d5',
  200: '#ffc6a8',
  300: '#ff9b6b',
  400: '#f9733f',
  500: '#ef5b2a',
  600: '#d94715',
  700: '#b63512',
  800: '#912d16',
  900: '#762817',
  950: '#401109',
}

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
        achievement,
        champagne,
        gold,
      },
    },
  },
  plugins: [forms],
}
