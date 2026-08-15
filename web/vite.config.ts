import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import { codecovVitePlugin } from '@codecov/vite-plugin'

// Identifies a deploy. The commit SHA in CI, otherwise the build time so local
// production builds still differ from one another.
const buildVersion = process.env.GITHUB_SHA?.slice(0, 12) ?? new Date().toISOString()

/**
 * Writes the build version to a file the running app can poll.
 *
 * Deploys `s3 sync --delete`, so a released build removes the previous build's
 * hashed chunks. Without this the first clue a user gets is a lazy route
 * failing to load.
 */
const emitVersionFile = (): Plugin => ({
  name: 'emit-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version: buildVersion }),
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
  },
  plugins: [
    vue(),
    vueJsx(),
    emitVersionFile(),
    process.env.VITE_ENABLE_DEVTOOLS === 'false' ? undefined : vueDevTools(),
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
      bundleName: 'crlssn/getstronger/web',
      uploadToken: process.env.CODECOV_TOKEN,
    }),
  ].filter((plugin) => plugin !== undefined),
  server: {
    host: '0.0.0.0',
    // Set per worktree by 'mise run worktree:env'. strictPort keeps a busy port
    // a visible failure instead of silently drifting onto another one.
    port: Number(process.env.WEB_DEV_PORT ?? 5173),
    strictPort: true,
    allowedHosts: ['carl.local'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
