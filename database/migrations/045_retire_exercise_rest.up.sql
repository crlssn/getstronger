-- Migration 044 gave a routine's occurrence its own rest, with NULL meaning
-- "ask the exercise library". That left one number with two homes, and the
-- library's copy is a default the routine has already answered for.
--
-- The occurrence becomes the only place a rest is written. Anything with no
-- occurrence behind it — a quick workout, an exercise added mid-session —
-- rests for the app default instead.

-- Every occurrence still inheriting takes the length it was inheriting, before
-- the column it inherits from is gone. Skipping this resets every routine
-- nobody has ever edited to 90 seconds, and there is no second chance: the
-- library values do not survive the drop below.
UPDATE public.exercises_routines AS er
SET rest_seconds = e.rest_seconds
FROM public.exercises AS e
WHERE e.id = er.exercise_id
  AND er.rest_seconds IS NULL;

-- With nothing left to inherit, the tri-state collapses: every occurrence
-- carries a real number, and 0 still means no timer.
ALTER TABLE public.exercises_routines
    ALTER COLUMN rest_seconds SET DEFAULT 90,
    -- The scan this warns about reads one row per exercise per routine, every
    -- one of which the backfill above has just written. The alternative it
    -- suggests, nullable plus a CHECK, is the tri-state being retired here.
    -- squawk-ignore adding-not-nullable-field
    ALTER COLUMN rest_seconds SET NOT NULL;

ALTER TABLE public.exercises_routines
    DROP CONSTRAINT exercises_routines_rest_seconds_valid;

ALTER TABLE public.exercises_routines
    ADD CONSTRAINT exercises_routines_rest_seconds_valid
        CHECK (rest_seconds BETWEEN 0 AND 3600);

-- Takes exercises_rest_seconds_valid with it.
ALTER TABLE public.exercises
    -- Dropping it is the point of the change rather than a side effect. The
    -- deploy runs the database before the server, so the previous revision
    -- selects a column that is already gone until it is replaced — seconds
    -- against one small database, and the price of retiring the column at all.
    -- squawk-ignore ban-drop-column
    DROP COLUMN rest_seconds;
