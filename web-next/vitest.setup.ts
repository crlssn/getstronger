// Adds the jest-dom matchers (toBeInTheDocument, etc.) to Vitest's `expect`.
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library only unmounts by itself when Vitest's globals are on, and
// they are not: the specs import describe/test/expect explicitly. Without this
// every render in a file stacks up in the same document, and a getByRole finds
// the button from the previous test as well as this one.
afterEach(cleanup)
