ALTER TABLE public.workouts ADD COLUMN started_at TIMESTAMP WITHOUT TIME ZONE;
UPDATE public.workouts SET started_at = finished_at;
ALTER TABLE public.workouts ALTER COLUMN started_at SET NOT NULL;
