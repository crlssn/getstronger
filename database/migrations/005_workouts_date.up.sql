ALTER TABLE getstronger.workouts ALTER COLUMN date TYPE TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE getstronger.workouts RENAME COLUMN date TO finished_at;
