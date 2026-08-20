// The mobile on-screen keyboard only retracts when the focused input blurs,
// so overlays call this as they open to avoid a keyboard under the dialog.
export default function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}
