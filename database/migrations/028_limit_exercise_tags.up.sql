ALTER TABLE public.exercises
    DROP CONSTRAINT exercises_tags_max_50,
    ADD CONSTRAINT exercises_tags_max_10 CHECK (CARDINALITY(tags) <= 10);
