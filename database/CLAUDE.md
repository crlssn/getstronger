# Database rules (`database/`)

Postgres, migrated with numbered SQL files in `migrations/` and modelled by
bobgen into `server/gen/`, which is never edited by hand.

- Before adding a migration, rebase onto the latest `main` and check
  `ls database/migrations | tail -1`. Another agent working in parallel may
  already have claimed the next number.
- Write an `up` migration only. This project rolls forward: a migration that
  turns out to be wrong is corrected by the next one, never reverted. The lone
  `001_schema.down.sql` is a whole-schema teardown that lets `mise run db:reset`
  rebuild a local database from nothing — it is not a precedent for
  per-migration down files.
- After adding a migration, run `mise run db:migrate`. It applies the pending
  migrations and regenerates the bob models from the resulting schema. Reach for
  `mise run db:reset` only when an existing migration was edited in place and
  the database has to be rebuilt from scratch.
- Then add any missing seed data and run `mise run db:seed` before verification.
- Only ever touch the container named by this worktree's `DB_CONTAINER`, and
  never run `db:reset`, `db:init`, or `db:clean` against another worktree's.
- Schema changes usually ripple outward: expect to touch `server/repo`, the
  proto schema, and the web client in the same change.
