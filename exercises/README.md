# The exercise library

A first session should start with a lift, not with a form. This directory is
the list of movements the create-exercise screen offers, so an athlete types
"bench", taps the entry, and saves — with the metrics and tags already right.

It is data, not code, and it is data people read: hand-edited, diffed and
argued about in pull requests, and commented where a choice is not obvious.
That is why it is YAML, and why it is split one file per muscle group rather
than being one file of a thousand entries.

Nothing parses YAML at runtime. `mise run gen:exercises` compiles this
directory into `web/src/exercises/catalogue.ts`, one typed module the create
screen imports on demand, and `web/tests/exercise-library.spec.ts` fails if the
two ever disagree.

## Files

One file per muscle group, and the file name is the group tag every entry in it
carries:

`arms.yaml`, `back.yaml`, `cardio.yaml`, `chest.yaml`, `core.yaml`,
`full-body.yaml`, `glutes.yaml`, `legs.yaml`, `shoulders.yaml`.

An exercise trains more than one thing; it is filed under the one it is trained
_for_. A barbell row is `back.yaml` even though the biceps work, and carries
its `biceps` tag there.

## An entry

```yaml
- key: barbell-back-squat # stable; renaming the English name breaks nothing
  names:
    en: Barbell back squat # required
    sv: Knäböj med skivstång # every other locale optional
  metrics: [weight, reps] # what a set of it records
  equipment: [barbell, squat-rack]
  tags: [legs, squat, quadriceps, glutes, compound]
```

### `key`

Lowercase, digits and hyphens. Unique across every file, and **stable**: it is
what a correction to an English name is allowed not to break. Read it as
implement first, then movement — `dumbbell-incline-bench-press`,
`cable-face-pull` — so entries for one movement sort together.

Never reuse a key for a different movement, and never rename one to tidy it up.

### `names`

A map of locale to name, so a third language is one more key and no code
change. `en` is required and is the fallback: an entry with no `sv` renders its
English name to a Swedish reader, which is the right outcome — a half-finished
translation ships rather than blocking the rest.

English names are sentence case (`Barbell back squat`, not `Barbell Back
Press`), spelled out rather than abbreviated (`Romanian deadlift`, not `RDL`),
and name the implement first where the implement is what makes the variant.

Swedish names are written for this repository. They are not lifted from another
Swedish dataset, and until a native speaker has been through them they are not
described as reviewed.

### `metrics`

What a set of the exercise records, from exactly the four the API accepts:

- `weight` — load, in the reader's unit
- `reps` — repetitions
- `distance` — distance covered
- `time` — how long it took, or how long it was held

`[weight, reps]` for anything loaded, `[reps]` for calisthenics nobody adds
load to, `[time]` for a hold, `[distance, time]` for cardio, and
`[weight, distance]` for a carry. A bodyweight movement that is commonly
weighted — pull-ups, dips, back extensions — takes `[weight, reps]` so a vest
can be logged.

### `equipment`

What the movement is performed with. Nothing outside this directory reads it
yet; it is here so that filtering by what a gym actually has is a later change
and not a data migration.

### `tags`

From the vocabulary below, at most ten — the API's limit — and the **first** of
them is the group tag the entry's file is named after. A movement that
genuinely trains a second region carries that group tag too, which is why a
back squat says `glutes`; the file's tag simply leads. They are saved on the
exercise as typed and shown to the reader as chips, so they stay short and
lowercase.

## Vocabulary

A tag or an implement not listed here is a typo. `web/src/exercises/vocabulary.ts`
is the machine-readable copy of these lists, and the schema test fails when it
and this file disagree — so a new term is added in both, in the same commit.

### Group tags

- `arms` — elbow flexion and extension trained for themselves
- `back` — the pulling musculature
- `cardio` — trained for the engine rather than the muscle
- `chest` — the pectorals
- `core` — the trunk, braced or flexed
- `full-body` — no one group owns it: olympic lifts, carries, conditioning
- `glutes` — hip extension trained for itself
- `legs` — knee-dominant lower body
- `shoulders` — the deltoids

### Muscle tags

- `abductors`
- `abs`
- `adductors`
- `biceps`
- `calves`
- `forearms`
- `front-delts`
- `hamstrings`
- `hip-flexors`
- `lats`
- `lower-back`
- `lower-chest`
- `obliques`
- `quadriceps`
- `rear-delts`
- `rhomboids`
- `serratus`
- `side-delts`
- `traps`
- `triceps`
- `upper-chest`

### Pattern tags

The library's coverage is measured across these, so an entry that is one of
them says so.

- `anti-extension`
- `anti-lateral-flexion`
- `anti-rotation`
- `carry`
- `hinge`
- `horizontal-pull`
- `horizontal-push`
- `lunge`
- `rotation`
- `squat`
- `vertical-pull`
- `vertical-push`

### Quality tags

- `bodyweight`
- `compound`
- `conditioning`
- `isolation`
- `isometric`
- `olympic`
- `plyometric`
- `unilateral`

### Equipment

- `ab-wheel`
- `air-bike`
- `band`
- `barbell`
- `battle-ropes`
- `bench`
- `bodyweight`
- `box`
- `cable`
- `decline-bench`
- `dip-bars`
- `dumbbell`
- `elliptical`
- `ez-bar`
- `glute-ham-bench`
- `hyperextension-bench`
- `incline-bench`
- `jump-rope`
- `kettlebell`
- `landmine`
- `machine`
- `medicine-ball`
- `plate`
- `preacher-bench`
- `pull-up-bar`
- `rings`
- `rower`
- `sandbag`
- `ski-erg`
- `sled`
- `smith-machine`
- `squat-rack`
- `stability-ball`
- `stair-climber`
- `stationary-bike`
- `suspension-trainer`
- `trap-bar`
- `treadmill`
- `weight-vest`

## Adding to it

**A movement.** Find the file for the group it is trained for, keep the
implement-then-movement key, and put it beside the entries it belongs with.
Then `mise run gen:exercises` and commit the regenerated module with the YAML.

**A variant.** Only when it trains differently. The same movement carrying
three names is what this library exists to stop, so a "seated cable row" and a
"cable row" are one entry; a close grip and a wide grip on a pulldown are two,
because the lats do a different job.

**A language.** Add the locale key under `names` for as many entries as are
translated, and nothing else. The app already falls back per entry.

## Where the data comes from

The English naming and the equipment and body-part vocabulary follow the
ExerciseDB v1 metadata redistributed under the MIT licence by
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset),
credited in the repository's [`NOTICE`](../NOTICE). None of that dataset's
images or animations are committed here — their ownership is disputed, and the
library needs none of them.

The entries themselves are written for this repository. ExerciseDB carries the
same movement three ways, and imported wholesale it makes autocomplete worse
rather than better, so near-duplicates are merged and only variants that
genuinely train differently are kept apart.
