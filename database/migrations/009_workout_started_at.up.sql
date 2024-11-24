ALTER TABLE getstronger.workouts ADD COLUMN started_at TIMESTAMP WITHOUT TIME ZONE;
UPDATE getstronger.workouts SET started_at = finished_at;
ALTER TABLE getstronger.workouts ALTER COLUMN started_at SET NOT NULL;
