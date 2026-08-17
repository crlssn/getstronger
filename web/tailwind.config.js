/** @type {import('tailwindcss').Config} */
import forms from '@tailwindcss/forms'

// No colour ramps live here any more. The design tokens are in
// src/assets/theme.css, where they are emitted as real custom properties:
// queryable at runtime, overridable per scope, and named for the role a value
// plays rather than the hue it happens to be. Records use the record-* tokens
// (gold on champagne); the achievement orange ramp is gone.
export default {
  content: ['./index.html', './src/**/*.{html,vue,js,ts,jsx,tsx}'],
  plugins: [forms],
}
