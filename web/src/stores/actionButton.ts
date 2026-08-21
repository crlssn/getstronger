import type { ComponentProps, ComponentType } from 'react'

import { create } from 'zustand'

interface Button {
  action: () => void
  icon: ComponentType<ComponentProps<'svg'>>
}

interface ActionButtonState {
  action: () => void
  icon: ComponentType<ComponentProps<'svg'>> | undefined
  set: (button: Button) => void
  reset: () => void
}

export const selectActionButtonActive = (state: ActionButtonState) => state.icon !== undefined

export const useActionButton = create<ActionButtonState>()((set) => ({
  action: () => {},
  icon: undefined,
  set: (button) => set({ action: button.action, icon: button.icon }),
  reset: () => set({ action: () => {}, icon: undefined }),
}))
