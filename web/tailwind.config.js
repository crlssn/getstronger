/** @type {import('tailwindcss').Config} */
import forms from '@tailwindcss/forms'

export default {
  content: ['./index.html', './src/**/*.{html,vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [forms],
}
