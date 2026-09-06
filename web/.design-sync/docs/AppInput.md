---
category: Input
---

The app's text field: one height from the control scale, one border, one focus
ring. `label` renders the field's own label; without it a caller must supply
`aria-label`. Pass `invalid` to mark it, `hint` for the line underneath, and
`labelAction` for a control that shares the label's line — the login screen's
"Forgot your password?".

`variant="card"` draws the field as the panel it fills — the label inside it as
an eyebrow, the value at title size, no border of its own. For the one field a
screen is built around, like a routine's name; a form of many fields keeps the
default.
