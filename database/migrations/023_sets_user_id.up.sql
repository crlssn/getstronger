ALTER TABLE getstronger.sets ADD COLUMN user_id UUID NULL;
UPDATE getstronger.sets SET user_id = (SELECT user_id FROM getstronger.workouts WHERE getstronger.workouts.id = getstronger.sets.workout_id);
ALTER TABLE getstronger.sets ALTER COLUMN user_id SET NOT NULL;
