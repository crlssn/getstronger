---
category: Lists and states
---

The ink dot at the right edge of a row not yet seen, before the chevron. It is
`aria-hidden` — the row says "unread" in words to a screen reader, because a
dot says nothing. It goes in an `<AppListRow>`'s `trailing`, which is what puts
it before the chevron rather than after.
