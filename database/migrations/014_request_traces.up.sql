CREATE TABLE getstronger.traces
(
    id          UUID PRIMARY KEY NOT NULL DEFAULT uuid_generate_v4(),
    request     TEXT             NOT NULL,
    status_code INT              NOT NULL,
    duration_ms INT              NOT NULL,
    created_at  TIMESTAMP        NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);
