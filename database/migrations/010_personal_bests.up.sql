CREATE OR REPLACE VIEW getstronger.personal_bests AS
SELECT
    uuid_generate_v5(
            '00000000-0000-0000-0000-000000000000',
            CONCAT(workout_id, exercise_id, weight, reps, created_at)
    ) AS id,
    workout_id,
    exercise_id,
    user_id,
    weight,
    reps,
    created_at
FROM (
         SELECT DISTINCT ON (exercise_id)
             sets.workout_id,
             sets.exercise_id,
             w.user_id,
             sets.weight,
             sets.reps,
             sets.created_at
         FROM getstronger.sets
            INNER JOIN getstronger.workouts w ON w.id = sets.workout_id
         WHERE sets.weight = (
             SELECT MAX(s.weight)
             FROM getstronger.sets s
             WHERE s.exercise_id = sets.exercise_id
         )
         ORDER BY sets.exercise_id, sets.created_at
     ) subquery;
