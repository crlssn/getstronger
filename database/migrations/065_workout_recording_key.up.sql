-- Where a workout's recording now lives: a key into object storage rather than
-- the document itself. Rows written before this keep their recording_json and
-- are read from it until the backfill moves them.
ALTER TABLE workouts ADD COLUMN recording_key text NOT NULL DEFAULT '';
