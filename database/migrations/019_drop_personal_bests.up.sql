DROP VIEW public.personal_bests;

CREATE INDEX ON public.sets (workout_id);
CREATE INDEX ON public.workouts (user_id);
