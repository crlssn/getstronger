-- Re-links a workout to the routine it was performed from. Nullable because
-- quick workouts have no routine, and workouts recorded before this migration
-- only kept the routine's name, so they cannot be back-filled.
ALTER TABLE getstronger.workouts
    ADD COLUMN routine_id UUID REFERENCES getstronger.routines (id) ON DELETE SET NULL;

CREATE INDEX workouts_routine_id_idx ON getstronger.workouts (routine_id);
