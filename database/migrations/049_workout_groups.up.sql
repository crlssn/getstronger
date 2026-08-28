-- A finished workout was a flat list of exercises, so a circuit and a block of
-- straight sets read identically once it was saved. The workout keeps its own
-- copy of the blocks it was trained in rather than reading the routine's: a
-- routine edited later must not rewrite what happened, a quick workout has no
-- routine to read, and the rounds actually worked are the session's answer
-- rather than the prescription's.

CREATE TABLE public.workout_groups
(
    id                             UUID PRIMARY KEY          NOT NULL DEFAULT uuid_generate_v4(),
    workout_id                     UUID                      NOT NULL REFERENCES public.workouts (id) ON DELETE CASCADE,
    position                       INTEGER                   NOT NULL CHECK (position >= 0),
    mode                           public.routine_group_mode NOT NULL DEFAULT 'straight',
    rest_between_exercises_seconds INTEGER                   NOT NULL DEFAULT 0 CHECK (rest_between_exercises_seconds BETWEEN 0 AND 3600),
    rest_between_rounds_seconds    INTEGER                   NOT NULL DEFAULT 0 CHECK (rest_between_rounds_seconds BETWEEN 0 AND 3600),
    rounds                         INTEGER                   NOT NULL DEFAULT 0 CHECK (rounds BETWEEN 0 AND 99),
    created_at                     TIMESTAMP                 NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    UNIQUE (workout_id, position)
);

CREATE INDEX workout_groups_workout_id_idx ON public.workout_groups (workout_id);

-- One exercise where a block trained it. A row of its own rather than a column
-- on the set, because the block holds its exercises in an order, and the same
-- exercise may be trained in two blocks of one session.
CREATE TABLE public.workout_group_exercises
(
    id               UUID PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
    workout_group_id UUID             NOT NULL REFERENCES public.workout_groups (id) ON DELETE CASCADE,
    exercise_id      UUID             NOT NULL REFERENCES public.exercises (id) ON DELETE CASCADE,
    position         INTEGER          NOT NULL CHECK (position >= 0),
    UNIQUE (workout_group_id, position)
);

CREATE INDEX workout_group_exercises_exercise_id_idx ON public.workout_group_exercises (exercise_id);

-- Nullable, and nulled rather than deleted with the block: a set is the record
-- of work done, and losing how it was grouped must never lose the set. Pointing
-- at the occurrence rather than the block names both at once — which block, and
-- which of its exercises.
ALTER TABLE public.sets
    ADD COLUMN workout_group_exercise_id UUID NULL REFERENCES public.workout_group_exercises (id) ON DELETE SET NULL;

CREATE INDEX sets_workout_group_exercise_id_idx ON public.sets (workout_group_exercise_id);

-- Every set of a workout is written in one transaction and so shares created_at
-- to the microsecond: the order they came back in was whatever the planner
-- chose. A circuit is read round by round off that order, so it has to be
-- recorded rather than inferred.
ALTER TABLE public.sets
    ADD COLUMN position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0);

-- Existing history keeps the order it has been rendered in until now.
WITH ordered AS (SELECT id,
                        ROW_NUMBER() OVER (
                            PARTITION BY workout_id, exercise_id
                            ORDER BY created_at, id
                            ) - 1 AS position
                 FROM public.sets)
UPDATE public.sets s
SET position = ordered.position
FROM ordered
WHERE ordered.id = s.id;
