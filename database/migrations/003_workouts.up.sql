ALTER TABLE public.workouts DROP COLUMN routine_id;
ALTER TABLE public.workouts ADD COLUMN name VARCHAR NOT NULL;
