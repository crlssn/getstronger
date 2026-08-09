/** @type {import('tailwindcss').Config} */
import forms from '@tailwindcss/forms'

const graphite = {
  50: '#f5f5f2',
  100: '#e8e9e7',
  200: '#d4d5d3',
  300: '#b7b9b7',
  400: '#898d91',
  500: '#565b61',
  600: '#25282d',
  700: '#1f2226',
  800: '#191c20',
  900: '#121417',
  950: '#0a0b0d',
}

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
        amber: achievement,
        champagne,
        gold,
        indigo: graphite,
        primary: graphite[600],
        violet: graphite,
      },
    },
  },
  plugins: [forms],
}
