import { AppButton, AppInput } from 'getstronger-ds'

export const Default = () => (
  <AppInput label="Email" type="email" defaultValue="alex@getstronger.app" />
)

export const WithHint = () => (
  <AppInput
    label="Routine name"
    hint="What you'll call this session in your history."
    defaultValue="Push day A"
  />
)

export const WithLabelAction = () => (
  <AppInput
    label="Password"
    type="password"
    defaultValue="correct horse battery"
    labelAction={
      <AppButton type="button" colour="ghost" size="inline" width="auto">
        Forgot your password?
      </AppButton>
    }
  />
)

export const Invalid = () => (
  <AppInput
    label="Email"
    type="email"
    defaultValue="alex@getstronger"
    invalid
    hint="That address is missing its domain."
  />
)

export const Hero = () => (
  <AppInput variant="hero" label="Routine name" defaultValue="Upper body, heavy" />
)
