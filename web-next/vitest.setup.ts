// Adds the jest-dom matchers (toBeInTheDocument, etc.) to Vitest's `expect`.
import '@testing-library/jest-dom/vitest'

import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Testing Library's own auto-cleanup only registers itself when it finds
// `afterEach` on the global scope, which needs `test.globals: true` in
// vitest.config.ts. This project doesn't set that, so it is wired up by hand
// — otherwise a component mounted by one test is still in the DOM for the
// next.
afterEach(() => cleanup())

// jsdom has no ResizeObserver. Headless UI's floating-element positioning
// (used by DropdownButton's menu) reaches for one unconditionally, so a
// no-op stub is enough to let it mount in tests that never assert on layout.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= NoopResizeObserver
