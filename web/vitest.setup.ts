// Adds the jest-dom matchers (toBeInTheDocument, etc.) to Vitest's `expect`.
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library only unmounts by itself when Vitest's globals are on, and
// they are not: the specs import describe/test/expect explicitly. Without this
// every render in a file stacks up in the same document, and a getByRole finds
// the button from the previous test as well as this one.
afterEach(cleanup)

// jsdom implements no layout, so it ships neither of these. Headless UI reaches
// for ResizeObserver when a menu or dialog opens, and a component that asks
// what the viewport looks like reaches for matchMedia. Both answer "nothing is
// happening", which is the truth in a document that never lays out.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (!globalThis.matchMedia) {
  globalThis.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
