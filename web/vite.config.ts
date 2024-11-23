import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
// import fs from "node:fs";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
  ],
  server: {
    // https: {
    //   key: fs.readFileSync('./../.secrets/localhost.key'),
    //   cert: fs.readFileSync('./../.secrets/localhost.crt'),
    // },
    host: '0.0.0.0',
    port: 5173, // Optional: set the port you want to use
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
