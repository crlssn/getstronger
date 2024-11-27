CREATE TYPE getstronger.notification_type AS ENUM ('Follow', 'WorkoutComment');

CREATE TABLE getstronger.notifications
(
    id         UUID PRIMARY KEY              NOT NULL DEFAULT uuid_generate_v4(),
    user_id    UUID                          NOT NULL REFERENCES getstronger.users (id),
    "type"     getstronger.notification_type NOT NULL,
    payload    JSONB                         NOT NULL,
    read_at    TIMESTAMP                     NULL,
    created_at TIMESTAMP                     NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_notifications_user_id_created_at ON getstronger.notifications (user_id, read_at);
