-- Rest between sets was a property of the exercise library, so a lift rested
-- the same length everywhere it was trained. Squats in a heavy strength block
-- and squats in a conditioning routine could not differ.
--
-- The occurrence row is where "this exercise, as trained in this group" lives,
-- so it is where the routine's own answer belongs. NULL inherits
-- exercises.rest_seconds; 0 turns the timer off for this occurrence alone.

ALTER TABLE public.exercises_routines
    ADD COLUMN rest_seconds INT NULL;

ALTER TABLE public.exercises_routines
    ADD CONSTRAINT exercises_routines_rest_seconds_valid
        CHECK (rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 3600);
