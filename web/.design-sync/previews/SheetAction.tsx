import { AppSheet, SheetAction } from 'getstronger-ds'

// SheetAction is styled for the sheet's stacked action list, so it is previewed
// in the parent it belongs to — the only render that is true anyway.
export const Tones = () => (
  <AppSheet
    title="Delete this routine?"
    body="Every workout logged from it stays in your history."
    onClose={() => undefined}
    actions={
      <>
        <SheetAction tone="primary">Save the routine</SheetAction>
        <SheetAction tone="danger">Delete the routine</SheetAction>
        <SheetAction tone="dangerOutline">Remove every exercise</SheetAction>
        <SheetAction tone="tertiary">Cancel</SheetAction>
      </>
    }
  />
)
