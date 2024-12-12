DROP VIEW getstronger.personal_bests;

CREATE INDEX ON getstronger.sets (workout_id);
CREATE INDEX ON getstronger.workouts (user_id);
