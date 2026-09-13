import { describe, expect, it, vi } from 'vitest'
import { randomUUID } from './randomUUID'

const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// `randomUUID` sits on Crypto.prototype, so shadowing it with an own property
// is the only way to hide it from the module under test.
const withoutRandomUUID = <T>(run: () => T): T => {
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
  try {
    return run()
  } finally {
    // @ts-expect-error the own property is a test shadow, not part of Crypto.
    delete crypto.randomUUID
  }
}

describe('randomUUID', () => {
  it('uses the platform implementation where there is one', () => {
    const native = vi.spyOn(crypto, 'randomUUID')

    expect(randomUUID()).toMatch(v4)
    expect(native).toHaveBeenCalled()

    native.mockRestore()
  })

  it('still mints a v4 UUID on a WebView too old to have one', () => {
    expect(withoutRandomUUID(randomUUID)).toMatch(v4)
  })

  it('does not repeat itself without the platform implementation', () => {
    const minted = withoutRandomUUID(() => new Set(Array.from({ length: 100 }, randomUUID)))

    expect(minted.size).toBe(100)
  })
})
