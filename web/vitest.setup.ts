// Adds the jest-dom matchers (toBeInTheDocument, etc.) to Vitest's `expect`.
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { clearListSnapshots } from '@/utils/usePagedList'

// Testing Library only unmounts by itself when Vitest's globals are on, and
// they are not: the specs import describe/test/expect explicitly. Without this
// every render in a file stacks up in the same document, and a getByRole finds
// the button from the previous test as well as this one.
//
// Every spec's router also starts on the same history key, so a list one test
// loaded would come back in the next as if the reader had gone back to it. The
// lists go after the unmount: a page landing in between would file one again.
afterEach(() => {
  cleanup()
  clearListSnapshots()
})

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
