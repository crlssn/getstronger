-- A block was known by its position alone, and an exercise in one was either
-- counted in sets or held against a clock — nothing said which, so a target
-- duration above zero had to stand in for the answer. A routine can now name
-- its blocks, say how many sets it prescribes, and prescribe a distance that
-- ends when it is covered rather than when a clock runs out.
--
-- Everything already saved keeps the session it had: an occurrence with a
-- target duration was trained against the clock, and every other one in sets.

CREATE TYPE public.routine_exercise_tracking AS ENUM (
    'sets',
    'timed',
    'distance'
);

ALTER TABLE public.routine_groups
    ADD COLUMN title TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 60);

ALTER TABLE public.exercises_routines
    ADD COLUMN tracking               public.routine_exercise_tracking NOT NULL DEFAULT 'sets',
    -- Zero is a routine that does not say how many sets it wants, which is
    -- every routine saved before it could.
    ADD COLUMN sets                   INTEGER                          NOT NULL DEFAULT 0 CHECK (sets BETWEEN 0 AND 20),
    ADD COLUMN target_distance_meters INTEGER                          NOT NULL DEFAULT 0 CHECK (target_distance_meters BETWEEN 0 AND 50000);

UPDATE public.exercises_routines
SET tracking = 'timed'
WHERE target_duration_seconds > 0;
