// Slot content in the Vue version reached unscoped `.sheet-actions > button`
// styling in `AppSheet.vue` just by being a `<button>` there — React has no
// such passthrough, so callers apply one of these classes to their own action
// buttons instead. The ranking is part of the sheet's design, so it stays
// defined next to it, in its own module so components stay fast-refreshable.
const base =
  'inline-flex min-h-(--size-control) w-full items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition disabled:opacity-60 [&>svg]:size-5'

export const sheetActionClass = {
  danger: `${base} bg-danger text-white hover:bg-danger-strong`,
  dangerOutline: `${base} border border-danger/30 text-danger hover:bg-danger-surface hover:text-danger-strong`,
  primary: `${base} bg-ink text-white hover:bg-ink-strong`,
  tertiary: `${base} border border-border text-text-muted hover:bg-ink-surface`,
}
