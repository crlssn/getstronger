CREATE TABLE public.workout_comments
(
    id         UUID PRIMARY KEY   DEFAULT uuid_generate_v4(),
    user_id    UUID      NOT NULL REFERENCES public.users (id),
    workout_id UUID      NOT NULL REFERENCES public.workouts (id),
    comment    TEXT      NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);
