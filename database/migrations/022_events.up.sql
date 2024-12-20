CREATE TYPE getstronger.event_topics AS ENUM (
    'UserSignedUp',
    'UserLoggedIn',
    'UserLoggedOut',
    'UserRefreshedAccessToken',
    'FollowedUser',
    'RequestTraced',
    'WorkoutCreated',
    'WorkoutUpdated',
    'WorkoutDeleted',
    'WorkoutCommentPosted'
    );

CREATE TABLE getstronger.events
(
    id         UUID PRIMARY KEY         NOT NUll DEFAULT uuid_generate_v4(),
    topic      getstronger.event_topics NOT NULL,
    payload    JSONB                    NOT NULL,
    created_at TIMESTAMP                NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE FUNCTION notify_event_func()
    RETURNS trigger AS
$$
BEGIN
    PERFORM pg_notify(NEW.topic::TEXT, NEW.payload::TEXT);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notify_event_trigger
    AFTER INSERT
    ON getstronger.events
    FOR EACH ROW
EXECUTE FUNCTION notify_event_func();
