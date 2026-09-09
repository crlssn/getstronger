-- A like is the lightest thing one athlete can say about another's session, so
-- it is a row and nothing more. The user-facing name is a rep; the schema says
-- like, because reps already mean the repetitions in a set.
--
-- The unique constraint is what makes liking idempotent: a second tap conflicts
-- instead of counting twice.
CREATE TABLE public.workout_likes
(
    id         UUID PRIMARY KEY   DEFAULT uuid_generate_v4(),
    user_id    UUID      NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    workout_id UUID      NOT NULL REFERENCES public.workouts (id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    UNIQUE (user_id, workout_id)
);

-- Deleting either party cascades into this table, and a cascade with no index
-- on the referencing column seq-scans it once per parent row; see 046. The
-- unique constraint already indexes user_id as its leading column.
CREATE INDEX ON public.workout_likes (workout_id);

-- Both enums are read by name and never ordered by, so where a new value lands
-- in the enum carries no meaning. Pinning it after a neighbour would only tie
-- this migration to whichever value happens to be last today.
-- squawk-ignore require-enum-value-ordering
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'WorkoutLike';
-- squawk-ignore require-enum-value-ordering
ALTER TYPE public.event_topic ADD VALUE IF NOT EXISTS 'WorkoutLiked';
