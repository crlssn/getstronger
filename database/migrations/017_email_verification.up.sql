ALTER TABLE getstronger.auth
    ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN email_token    UUID    NOT NULL DEFAULT uuid_generate_v4();
