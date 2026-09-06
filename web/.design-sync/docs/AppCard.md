---
category: Surfaces
---

The panel: rounded, on `--color-surface`, lifted by the card shadow. **No
border** — elevation and a hairline never combine, so a top-level card takes
the shadow and a container nested inside one closes its edge instead. That is
what the `card` utility draws too, and a component that styles its own
container applies it in the CSS module rather than nesting an `<AppCard>`:
same shape, one definition.
