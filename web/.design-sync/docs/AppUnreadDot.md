---
category: Lists and states
---

The ink dot at the right edge of a row not yet seen, before the chevron. It is
`aria-hidden` — the row says "unread" in words to a screen reader, because a
dot says nothing.

It belongs in an `AppListRow`'s `trailing`, which puts it before the chevron:

```jsx
<AppListRow
  title="Alex logged Push day A"
  meta="Just now"
  trailing={<AppUnreadDot />}
  to="/feed/1"
/>
```
