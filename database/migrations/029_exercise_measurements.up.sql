ALTER TABLE getstronger.exercises
    ADD COLUMN metrics TEXT[] NOT NULL DEFAULT ARRAY['weight', 'reps']::TEXT[],
    ADD COLUMN rest_seconds INT NOT NULL DEFAULT 90,
    ADD CONSTRAINT exercises_metrics_not_empty CHECK (CARDINALITY(metrics) > 0),
    ADD CONSTRAINT exercises_metrics_valid CHECK (
        metrics <@ ARRAY['weight', 'reps', 'distance', 'time']::TEXT[]
    ),
    ADD CONSTRAINT exercises_rest_seconds_valid CHECK (rest_seconds BETWEEN 0 AND 3600);

ALTER TABLE getstronger.sets
    ADD COLUMN distance DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN duration_seconds INT NOT NULL DEFAULT 0,
    ADD CONSTRAINT sets_distance_non_negative CHECK (distance >= 0),
    ADD CONSTRAINT sets_duration_seconds_non_negative CHECK (duration_seconds >= 0);
