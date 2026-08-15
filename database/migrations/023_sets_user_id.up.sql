ALTER TABLE public.sets ADD COLUMN user_id UUID NULL;
UPDATE public.sets SET user_id = (SELECT user_id FROM public.workouts WHERE public.workouts.id = public.sets.workout_id);
ALTER TABLE public.sets ALTER COLUMN user_id SET NOT NULL;
