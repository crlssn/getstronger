---
category: Actions
---

Every tappable thing that is not an icon on its own. Four roles, not six
colours: `primary` (ink fill), `secondary` (white with an ink border), `ghost`
(text only) and `destructive` (danger text, never a red fill). `type="link"`
renders a router link with the same shape, so "go somewhere" and "do something"
look alike without a screen restyling an anchor.

`size` picks the height from the control scale: `md` (48px, the default), `sm`
(44px, the tap-target floor) or `lg` (56px, a form's submit). `inline` is `sm`'s
height with the type of the copy it sits beside, for a quiet action inside a
line of text — it keeps the tap target and gives up only the weight that made it
read as that line's heading. Buttons are full-width by default because most of
them are; `width="auto"` shrinks one to its content.
