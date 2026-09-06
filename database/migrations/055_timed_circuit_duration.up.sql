ALTER TABLE exercises_routines
    ADD COLUMN target_duration_seconds integer NOT NULL DEFAULT 0
    CHECK (target_duration_seconds BETWEEN 0 AND 86400);
