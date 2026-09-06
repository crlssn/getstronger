---
category: Lists and states
---

**Deprecated, and removed after one release.** Both describe themselves as a
row, and `<AppListRow>` is the better one: fixed slots, a chevron on every row
that navigates, and a trailing value that knows what to do at 390px. ESLint
rejects either of them outside this directory.

`is="danger"` is `tone="danger"` on the row; `is="header"` is `<AppList
heading>`. The third thing only these could do was free-form children, and
content that is none of leading, title, meta or trailing was never a list row:
it belongs in `<AppOptionRow>`, `<AppPreferenceRow>`, or a widget of its own in
`ui/features`.
