ALTER TABLE public.routines ADD COLUMN exercise_order JSONB NOT NULL DEFAULT '[]'::jsonb;
