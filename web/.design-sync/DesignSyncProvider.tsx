import type { ReactNode } from 'react'

import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '@/i18n'

/**
 * The context every screen has in the real app, for design-system previews.
 *
 * Mirrors `renderWithProviders` in `src/ui/testing.tsx`: anything using `t()`
 * renders its keys without the i18n provider, and anything containing a
 * `Link` throws without a router.
 */
export const DesignSyncProvider = ({ children }: { children?: ReactNode }) => (
  <I18nextProvider i18n={i18n}>
    <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>
  </I18nextProvider>
)
