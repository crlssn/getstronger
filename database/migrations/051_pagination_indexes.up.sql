-- Two lists are paged newest-first by (created_at, id), and both are filtered
-- by a column indexed on its own: sets by exercise_id since 021, workouts by
-- user_id since 019. An index on the filter alone finds the rows but says
-- nothing about their order, so Postgres reads every row behind the filter and
-- top-N sorts it to hand back twenty. The first page costs what the whole
-- history costs, and the keyset token does not help — a later page reads the
-- same rows and throws more of them away.
--
-- Carrying the ordering columns turns both into an index scan that stops at the
-- limit. Measured on 300 athletes with 90,000 workouts and 1.8m sets: the
-- exercise page reads 16 buffers rather than 357 and takes 0.10 ms rather than
-- 0.64 ms; the athlete's workout page, which the dashboard opens on every
-- launch, reads 24 rather than 308 and takes 0.13 ms rather than 3.00 ms. The
-- cost that goes away is the one that grew with how long the athlete has
-- trained.
--
-- The narrow indexes stay. Both are prefixes of the new ones and so redundant
-- for a single athlete or exercise, but the feed filters workouts by twenty
-- followees at once, which no index can order in one scan; it reads the narrow
-- index and sorts either way, and measurably prefers the narrower one.

CREATE INDEX sets_exercise_id_created_at_id_idx
    ON public.sets (exercise_id, created_at, id);

CREATE INDEX workouts_user_id_created_at_id_idx
    ON public.workouts (user_id, created_at, id);
