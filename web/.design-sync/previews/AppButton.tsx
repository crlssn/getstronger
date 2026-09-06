import { AppButton } from 'getstronger-ds'

export const Roles = () => (
  <div style={{ display: 'grid', gap: 12 }}>
    <AppButton type="button" colour="primary">
      Start workout
    </AppButton>
    <AppButton type="button" colour="secondary">
      Save as routine
    </AppButton>
    <AppButton type="button" colour="ghost">
      Skip this exercise
    </AppButton>
    <AppButton type="button" colour="destructive">
      Delete routine
    </AppButton>
  </div>
)

export const Sizes = () => (
  <div style={{ display: 'grid', gap: 12 }}>
    <AppButton type="submit" colour="primary" size="lg">
      Log in
    </AppButton>
    <AppButton type="button" colour="secondary" size="md">
      Add exercise
    </AppButton>
    <AppButton type="button" colour="secondary" size="sm">
      Add a note
    </AppButton>
    <AppButton type="button" colour="ghost" size="inline" width="auto">
      Forgot your password?
    </AppButton>
  </div>
)

export const Widths = () => (
  <div style={{ display: 'grid', gap: 12 }}>
    <AppButton type="button" colour="primary">
      Full width, the default
    </AppButton>
    <AppButton type="button" colour="secondary" width="auto">
      Shrink to fit
    </AppButton>
  </div>
)

export const Disabled = () => (
  <div style={{ display: 'grid', gap: 12 }}>
    <AppButton type="submit" colour="primary" disabled>
      Finish workout
    </AppButton>
    <AppButton type="button" colour="secondary" disabled>
      Add exercise
    </AppButton>
  </div>
)

export const AsLink = () => (
  <AppButton type="link" colour="primary" to="/workouts/new">
    Start an empty workout
  </AppButton>
)
