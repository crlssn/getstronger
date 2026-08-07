ALTER TABLE getstronger.exercises
    ADD COLUMN tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE getstronger.exercises
SET tags = ARRAY[TRIM(sub_title)]
WHERE sub_title IS NOT NULL
  AND TRIM(sub_title) <> '';

ALTER TABLE getstronger.exercises
    ADD CONSTRAINT exercises_tags_max_50 CHECK (CARDINALITY(tags) <= 50),
    DROP COLUMN sub_title;
