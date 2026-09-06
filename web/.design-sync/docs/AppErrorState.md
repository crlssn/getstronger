---
category: Lists and states
---

The counterpart to `<AppEmptyState>`, and the reason both exist: a screen that
only checks `length === 0` renders an unreachable server as an empty list,
which is the more confident of the two claims and the harder one to argue
with. `onRetry` is required for the same reason `action` is over there — a
dead end is not a state. `compact` is the one-row form, for a failure under
content that did arrive.
