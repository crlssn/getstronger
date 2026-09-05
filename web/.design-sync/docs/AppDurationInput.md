---
category: Input
---

The two fields a set is logged with. Both keep the text being typed rather than
the number read back from it — rendering the value straight into the input eats
the keystroke halfway through "3.5", because "3." parses to 3 and is written
back as "3". `<AppNumberField>` takes an optional `unit`, drawn inside the
field's border as a label on it rather than a control in it.

Both are `type="text"` with an `inputMode`, not `type="number"`: a spinner on a
set row is a mis-tap waiting to happen, and a scroll wheel over one silently
changes what was logged.
