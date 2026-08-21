import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// TODO(#1100): this is a placeholder bootstrap while the app is scaffolded.
// The real entry point ports web/src/main.ts: auth-store init, token refresh,
// PostHog identify, router mount, and route warming all belong here once
// their React equivalents exist. See MIGRATION_PLAN.md phase B/C.

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('#root element is missing from index.html')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

document.getElementById('boot-splash')?.remove()

console.log('App initialized')
