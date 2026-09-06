---
category: Lists and states
---

The card that holds rows. `canFetch` decides whether it also fetches its next
page as the bottom scrolls into view, so the same component is the plain
container and the infinite one — a list that has everything it will ever have
simply leaves the sentinel out.

`heading` is a section label above the first row, drawn as the app's eyebrow.
It is also the list's accessible name, so the row itself is `aria-hidden` and
the section is announced once rather than twice. One card, one heading: a list
that wants two of them is two cards.
