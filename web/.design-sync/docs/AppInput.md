---
category: Input
---

The app's text field: one height from the control scale, one border, one focus
ring. `label` renders the field's own label; without it a caller must supply
`aria-label`. Pass `invalid` to mark it, `hint` for the line underneath, and
`labelAction` for a control that shares the label's line — the login screen's
"Forgot your password?".

`variant="hero"` is for the one field a screen is built around, like a routine's
name: the label rises to the caps overline register on the page background, and
the input keeps the standard treatment. A form of many fields keeps the default.
