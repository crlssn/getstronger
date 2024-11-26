CREATE TABLE getstronger.workout_comments
(
    id         UUID PRIMARY KEY   DEFAULT uuid_generate_v4(),
    workout_id UUID      NOT NULL REFERENCES getstronger.workouts (id),
    user_id    UUID      NOT NULL references getstronger.users (id),
    comment    TEXT      NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);
