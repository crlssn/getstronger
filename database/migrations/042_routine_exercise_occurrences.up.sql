-- An exercise could appear in a routine once, because the link table was keyed
-- by the pair of routine and exercise. Groups make that restriction arbitrary:
-- a bench press in the warm-up and a bench press in the circuit are two
-- different pieces of work, and the routine should be able to say so.
--
-- The link becomes a row in its own right, identified by itself rather than by
-- what it points at.

ALTER TABLE public.exercises_routines
    DROP CONSTRAINT routine_exercises_pkey;

ALTER TABLE public.exercises_routines
    ADD COLUMN id UUID NOT NULL DEFAULT uuid_generate_v4();

ALTER TABLE public.exercises_routines
    ADD PRIMARY KEY (id);

-- The read path orders a group's exercises by position, so the pair a routine
-- is walked by is the one worth indexing.
CREATE INDEX exercises_routines_routine_id_position_idx
    ON public.exercises_routines (routine_id, position);
