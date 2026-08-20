# Database rules (`database/`)

Postgres, migrated with numbered SQL files in `migrations/` and modelled by
bobgen into `server/gen/`, which is never edited by hand.

- Before adding a migration, rebase onto the latest `main` and check
  `ls database/migrations | tail -1`. Another agent working in parallel may
  already have claimed the next number.
- Write both an `up` and a `down` migration, matching the pair naming already in
  `migrations/`.
- After adding a migration, run `mise run db:reset` — it rolls every migration
  back, reapplies them, and regenerates the bob models from the resulting
  schema. Then add any missing seed data and `mise run db:seed` before
  verification. `mise run db:migrate` only applies pending migrations and does
  not regenerate models.
- Only ever touch the container named by this worktree's `DB_CONTAINER`, and
  never run `db:reset`, `db:init`, or `db:clean` against another worktree's.
- Schema changes usually ripple outward: expect to touch `server/repo`, the
  proto schema, and the web client in the same change.
