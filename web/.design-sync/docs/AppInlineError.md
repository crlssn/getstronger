---
category: Lists and states
---

An action's failure, said beside the control that raised it. Errors never
toast: a toast floats away from what needs correcting and dismisses itself,
so the message stays in the form, sheet or card until it is fixed. Rendered
with `role="alert"`, and takes an `id` so a field can point at it with
`aria-describedby`. The difference from `<AppErrorState>` is what failed: that
one is a fetch the screen cannot render without, this one is an action whose
screen is otherwise fine.
