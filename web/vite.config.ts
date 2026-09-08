import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
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

/**
 * Fails the build if a stylesheet still carries an `@apply`.
 *
 * Tailwind expands a CSS Module's `@apply` rules only the first time it meets
 * the file in a build, so a module that reaches the bundle twice ships its
 * second copy raw, and browsers drop the rule as an unknown at-rule. Nothing
 * else reports it: the build stays green and the copy in a chunk every page
 * loads masks the loss until chunking moves it.
 */
const rejectUnexpandedApply = (): Plugin => ({
  name: 'reject-unexpanded-apply',
  apply: 'build',
  enforce: 'post',
  generateBundle(_, bundle) {
    const raw: string[] = []
    for (const file of Object.values(bundle)) {
      if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue
      const css =
        typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source)
      if (/@apply\b/.test(css)) raw.push(file.fileName)
    }

    if (raw.length > 0) this.error(`@apply rules shipped unexpanded in ${raw.join(', ')}`)
  },
})

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
  },
  plugins: [
    react(),
    emitVersionFile(),
    rejectUnexpandedApply(),
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
      bundleName: 'crlssn/getstronger/web',
      uploadToken: process.env.CODECOV_TOKEN,
    }),
  ],
  server: {
    host: '0.0.0.0',
    // Set per worktree by 'mise run worktree:env'. strictPort keeps a busy port
    // a visible failure instead of silently drifting onto another one.
    port: Number(process.env.WEB_DEV_PORT ?? 5173),
    strictPort: true,
    allowedHosts: ['carl.local'],
  },
  preview: {
    // The dev server's port: they serve the same app and are never both
    // running, and 'vite preview' otherwise takes one default for the machine.
    port: Number(process.env.WEB_DEV_PORT ?? 5173),
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
