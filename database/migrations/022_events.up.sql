CREATE TYPE public.event_topic AS ENUM (
    'FollowedUser',
    'RequestTraced',
    'WorkoutCommentPosted'
);

CREATE TABLE public.events
(
    id         UUID PRIMARY KEY        NOT NUll DEFAULT uuid_generate_v4(),
    topic      public.event_topic      NOT NULL,
    payload    JSONB                   NOT NULL,
    created_at TIMESTAMP               NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);
