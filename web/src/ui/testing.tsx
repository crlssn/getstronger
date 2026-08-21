import type { ReactElement, ReactNode } from 'react'

import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '@/i18n'

interface Options extends Omit<RenderOptions, 'wrapper'> {
  /** The URL the component should believe it is on. */
  route?: string
}

/**
 * Renders a component with the context every screen has in the real app.
 *
 * Anything using `t()` needs the i18n provider or it renders its keys, and
 * anything containing a `Link` throws without a router. Wrapping both here
 * keeps that out of every spec.
 */
export const renderWithProviders = (ui: ReactElement, options: Options = {}): RenderResult => {
  const { route = '/', ...rest } = options

  const Providers = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </I18nextProvider>
  )

  return render(ui, { wrapper: Providers, ...rest })
}
