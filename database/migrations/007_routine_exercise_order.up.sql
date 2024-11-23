ALTER TABLE getstronger.routines ADD COLUMN exercise_order JSONB NOT NULL DEFAULT '[]'::jsonb;
