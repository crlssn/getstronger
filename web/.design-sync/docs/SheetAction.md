---
category: Surfaces
---

One bottom sheet for every modal surface: drag handle, optional eyebrow, title,
body copy, a content region for list-style sheets, and stacked full-width
actions. `<SheetAction>`'s `tone` is the ranking rather than a colour, and it
is a prop rather than a class so a caller cannot invent a fifth one.

It slides in and out on its own (a fade-and-settle when centred on desktop),
even though callers close it by unmounting: the sheet stages its own exit, so
keep mounting it conditionally rather than reaching for an `open` prop.
