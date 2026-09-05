import { AppSheet, SheetAction } from 'getstronger-ds'

// The sheet is a fixed overlay: it fills the card rather than sitting in it,
// so cfg.overrides.AppSheet pins the card to one story.
export const ADecision = () => (
  <AppSheet
    title="Discard this workout?"
    body="The sets you have logged will not be saved."
    eyebrow="Unsaved"
    eyebrowTone="danger"
    onClose={() => undefined}
    actions={
      <>
        <SheetAction tone="danger">Discard the workout</SheetAction>
        <SheetAction tone="tertiary">Keep logging</SheetAction>
      </>
    }
  />
)

export const APicker = () => (
  <AppSheet
    title="Pick an exercise"
    eyebrow="Push day A"
    onClose={() => undefined}
    actions={<SheetAction tone="tertiary">Cancel</SheetAction>}
  >
    <div style={{ display: 'grid', gap: 4 }}>
      <span>Bench press</span>
      <span>Overhead press</span>
      <span>Dips</span>
    </div>
  </AppSheet>
)
