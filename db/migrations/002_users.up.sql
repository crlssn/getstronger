CREATE TABLE getstronger.users
(
    id         UUID PRIMARY KEY NOT NULL,
    email      VARCHAR(255)     NOT NULL,
    password   VARCHAR(255)     NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
