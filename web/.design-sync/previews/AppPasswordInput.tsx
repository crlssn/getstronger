import { AppPasswordInput } from 'getstronger-ds'

export const Default = () => (
  <AppPasswordInput
    label="Password"
    value="correct horse battery"
    onValueChange={() => undefined}
  />
)

export const WithHint = () => (
  <AppPasswordInput
    label="New password"
    hint="At least 12 characters."
    value="correct horse battery"
    onValueChange={() => undefined}
  />
)

export const Invalid = () => (
  <AppPasswordInput
    label="Password"
    invalid
    hint="That password is too short."
    value="short"
    onValueChange={() => undefined}
  />
)
