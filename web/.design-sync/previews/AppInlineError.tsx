import { AppButton, AppCard, AppInlineError, AppInput } from 'getstronger-ds'

export const UnderAField = () => (
  <div style={{ display: 'grid', gap: 8 }}>
    <AppInput label="Email" type="email" defaultValue="alex@getstronger" invalid />
    <AppInlineError>That address is missing its domain.</AppInlineError>
  </div>
)

export const UnderAnAction = () => (
  <AppCard>
    <div style={{ display: 'grid', gap: 12, padding: 20 }}>
      <AppButton type="button" colour="primary">
        Finish workout
      </AppButton>
      <AppInlineError>Could not save the workout. Your sets are still here.</AppInlineError>
    </div>
  </AppCard>
)

export const Alone = () => <AppInlineError>That routine name is already taken.</AppInlineError>
