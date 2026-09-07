-- Four indexes that answer nothing another index does not.

-- Three are the same mistake made three times: an index was widened and the
-- narrow one it grew from stayed behind. A lookup by the leading column reads
-- the wide index just as happily, so what is left is a write per row and a
-- share of cache. 019 and 021 added the two single-column ones; 051 widened
-- both and left them. 049 added its own alongside the UNIQUE (workout_id,
-- position) it wrote in the same file.
--
-- Both cascades that travelled the two dropped here still find their index:
-- sets_exercise_id_fkey reads sets_exercise_id_created_at_id_idx and
-- workouts_user_id_fkey reads workouts_user_id_created_at_id_idx, each from
-- the same leading column.
DROP INDEX public.sets_exercise_id_idx;
DROP INDEX public.workouts_user_id_idx;
DROP INDEX public.workout_groups_workout_id_idx;

-- The fourth is redundant for a different reason. 043 made lower(email) unique,
-- and two rows cannot share a lowercase form without sharing the exact form, so
-- the older constraint on email refuses only what the newer index refuses
-- first. Nothing branches on its name: CreateAuth asks whether the address is
-- taken before inserting, and the generated dberrors entry for it is unused.
ALTER TABLE public.auth
    DROP CONSTRAINT auth_email_key;
