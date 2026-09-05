---
category: Surfaces
---

Pick one of these. `<AppSegmented>` takes `options` and reports the value that
was chosen; `<AppSegmentedNav>` is the same control where each option is its own
route. `label` is required — a row of unlabelled options says nothing to a
screen reader — and each option carries `aria-pressed`, not just a class.
`density="compact"` is for short labels — numeric ranges (7D, 4W, 1Y) and a
switch that has to share a row with a title. Nothing long enough to need the
room it gives up.

A row too wide for its container scrolls, and the edge still hiding an option
fades out. Without the fade a cut-off label — "Distance × time | Re…" — reads
as a rendering fault rather than as something to swipe.
