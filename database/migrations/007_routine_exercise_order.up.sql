CREATE TABLE getstronger.routine_exercises_sort_order
(
    id          UUID PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
    routine_id  UUID             NOT NULL REFERENCES getstronger.routines (id),
    exercise_id UUID             NOT NULL REFERENCES getstronger.exercises (id),
    sort_order  INT              NOT NULL,
    UNIQUE (routine_id, exercise_id)
);
