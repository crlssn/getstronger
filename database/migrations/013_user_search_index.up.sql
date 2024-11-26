CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE getstronger.users
    ADD COLUMN full_name_search TEXT GENERATED ALWAYS AS (lower(first_name || ' ' || last_name)) STORED;

CREATE INDEX idx_users_full_name_search ON getstronger.users USING gin (full_name_search gin_trgm_ops);
