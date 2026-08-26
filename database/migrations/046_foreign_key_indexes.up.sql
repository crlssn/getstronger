-- Seven foreign keys had no index behind them, so every lookup along them read
-- the whole child table. Postgres indexes the parent side of a reference for
-- free and the child side never, which is the side both cascading deletes and
-- these queries travel.
--
-- Deleting an account felt it worst: the cascade runs one child lookup per
-- parent row, so a user with 40 workouts seq-scanned workout_comments 40
-- times. On a database of 3,000 athletes that delete took 838 ms and now takes
-- 11 ms, and the cost grew with the child tables rather than with the account
-- being deleted.
--
-- The two leading columns also carry the created_at each list paginates by, so
-- the library and routine pages get their ordering from the same index instead
-- of sorting afterwards.

CREATE INDEX ON public.exercises (user_id, created_at);

CREATE INDEX ON public.routines (user_id, created_at);

-- Reversed against the primary key, which already covers follower → followee.
-- This direction answers "who follows this athlete" without touching the table.
CREATE INDEX ON public.followers (followee_id, follower_id);

CREATE INDEX ON public.workout_comments (workout_id);

CREATE INDEX ON public.workout_comments (user_id);

-- Detaching an exercise from every routine that trains it, which a soft delete
-- does, searches this column.
CREATE INDEX ON public.exercises_routines (exercise_id);

-- plans already has a unique index on user_id, but only WHERE active, so
-- nothing reaches a user's paused plans without reading the table.
CREATE INDEX ON public.plans (user_id);
