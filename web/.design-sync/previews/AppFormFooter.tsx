import { AppButton, AppFormFooter, AppInput } from 'getstronger-ds'

// The footer pins itself above the tab bar, so it fills the card rather than
// sitting in it — cfg.overrides.AppFormFooter pins the card to one story.
export const Default = () => (
  <>
    <AppInput label="Routine name" defaultValue="Push day A" />
    <AppFormFooter>
      <AppButton type="submit" colour="primary" size="lg">
        Save the routine
      </AppButton>
    </AppFormFooter>
  </>
)

export const WithHintAndSecondary = () => (
  <>
    <AppInput label="Routine name" />
    <AppFormFooter
      hint="Name the routine before you can save it."
      secondary={
        <AppButton type="button" colour="ghost" width="auto">
          Cancel
        </AppButton>
      }
    >
      <AppButton type="submit" colour="primary" size="lg" disabled>
        Save the routine
      </AppButton>
    </AppFormFooter>
  </>
)

export const WithAnError = () => (
  <>
    <AppInput label="Routine name" defaultValue="Push day A" />
    <AppFormFooter error="That routine name is already taken.">
      <AppButton type="submit" colour="primary" size="lg">
        Save the routine
      </AppButton>
    </AppFormFooter>
  </>
)
