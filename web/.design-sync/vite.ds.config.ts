// Library build of the design system, for design-sync.
//
// The app's own toolchain does the work: Vite runs the repo's PostCSS and
// Tailwind config, so the CSS Modules' `@apply`/`@reference` rules expand and
// the class hashes in the JS match the emitted stylesheet. Bundling the source
// with esbuild alone would ship the `@apply` rules unexpanded and every
// component would render unstyled.
import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const web = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) },
  },
  build: {
    outDir: fileURLToPath(new URL('../ds-dist', import.meta.url)),
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    minify: false,
    lib: {
      entry: fileURLToPath(new URL('./entry.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      // Everything the design system does not own stays external; the
      // converter's esbuild pass resolves it from the app's node_modules.
      external: (id) =>
        !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('@/') && !id.includes(web),
      output: { assetFileNames: 'style.css' },
    },
  },
})
