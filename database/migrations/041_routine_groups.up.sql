-- A routine used to be one flat list of exercises, trained one exercise at a
-- time. Groups let a routine hold a warm-up worked straight through and a
-- circuit rotated through, each carrying its own rest. How many rounds a
-- circuit runs for is the session's business, not the routine's.

CREATE TYPE public.routine_group_mode AS ENUM (
    'straight',
    'circuit'
);

CREATE TABLE public.routine_groups
(
    id                             UUID PRIMARY KEY          NOT NULL DEFAULT uuid_generate_v4(),
    routine_id                     UUID                      NOT NULL REFERENCES public.routines (id) ON DELETE CASCADE,
    position                       INTEGER                   NOT NULL CHECK (position >= 0),
    mode                           public.routine_group_mode NOT NULL DEFAULT 'straight',
    rest_between_exercises_seconds INTEGER                   NOT NULL DEFAULT 0 CHECK (rest_between_exercises_seconds BETWEEN 0 AND 3600),
    rest_between_rounds_seconds    INTEGER                   NOT NULL DEFAULT 0 CHECK (rest_between_rounds_seconds BETWEEN 0 AND 3600),
    created_at                     TIMESTAMP                 NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    UNIQUE (routine_id, position)
);

ALTER TABLE public.exercises_routines
    ADD COLUMN group_id UUID NULL REFERENCES public.routine_groups (id) ON DELETE CASCADE;

-- Every existing routine keeps exactly the session it already had: a single
-- straight-sets group holding all of its exercises in their current order.
INSERT INTO public.routine_groups (routine_id, position, mode)
SELECT id, 0, 'straight'
FROM public.routines;

UPDATE public.exercises_routines er
SET group_id = g.id
FROM public.routine_groups g
WHERE g.routine_id = er.routine_id
  AND g.position = 0;

ALTER TABLE public.exercises_routines
    ALTER COLUMN group_id SET NOT NULL;

CREATE INDEX exercises_routines_group_id_idx ON public.exercises_routines (group_id);
