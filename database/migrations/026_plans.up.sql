CREATE TABLE getstronger.plans
(
    id               UUID PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
    user_id          UUID             NOT NULL REFERENCES getstronger.users (id),
    name             VARCHAR          NOT NULL,
    active           BOOLEAN          NOT NULL DEFAULT FALSE,
    current_position INTEGER          NOT NULL DEFAULT 0 CHECK (current_position >= 0),
    created_at       TIMESTAMP        NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at       TIMESTAMP        NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE UNIQUE INDEX plans_one_active_per_user
    ON getstronger.plans (user_id)
    WHERE active;

CREATE TABLE getstronger.plan_routines
(
    plan_id    UUID    NOT NULL REFERENCES getstronger.plans (id) ON DELETE CASCADE,
    routine_id UUID    NOT NULL REFERENCES getstronger.routines (id),
    position   INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (plan_id, position),
    UNIQUE (plan_id, routine_id)
);

CREATE INDEX plan_routines_routine_id_idx ON getstronger.plan_routines (routine_id);
