CREATE TABLE public.auth
(
    id            UUID PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
    email         VARCHAR(128)     NOT NULL UNIQUE,
    password      BYTEA            NOT NULL,
    refresh_token VARCHAR(256)     NULL,
    created_at    TIMESTAMP        NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE public.users
(
    id         UUID PRIMARY KEY NOT NULL REFERENCES public.auth (id),
    first_name VARCHAR          NOT NULL,
    last_name  VARCHAR          NOT NULL,
    created_at TIMESTAMP        NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE public.routines
(
    id         UUID PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
    user_id    UUID             NOT NULL REFERENCES public.users (id),
    title      VARCHAR          NOT NULL,
    created_at TIMESTAMP        NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    deleted_at TIMESTAMP        NULL
);

CREATE TABLE public.exercises
(
    id                UUID PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
    user_id           UUID             NOT NULL REFERENCES public.users (id),
    title             VARCHAR          NOT NULL,
    sub_title         VARCHAR,
    rest_between_sets SMALLINT         NULL,
    created_at        TIMESTAMP        NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    deleted_at        TIMESTAMP        NULL
);

CREATE TABLE public.routine_exercises
(
    routine_id  UUID NOT NULL REFERENCES public.routines (id),
    exercise_id UUID NOT NULL REFERENCES public.exercises (id),
    PRIMARY KEY (routine_id, exercise_id)
);

CREATE TABLE public.workouts
(
    id         UUID PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
    user_id    UUID             NOT NULL REFERENCES public.users (id),
    routine_id UUID             NOT NULL REFERENCES public.routines (id),
    date       DATE             NOT NULL,
    created_at TIMESTAMP        NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE public.sets
(
    id          UUID PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
    workout_id  UUID             NOT NULL REFERENCES public.workouts (id),
    exercise_id UUID             NOT NULL REFERENCES public.exercises (id),
    weight      DECIMAL(8, 2)    NOT NULL,
    reps        INT              NOT NULL,
    created_at  TIMESTAMP        NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);
