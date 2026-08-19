-- The order of a routine's exercises used to live in routines.exercise_order,
-- a JSONB array of exercise IDs that the join table knew nothing about. Give
-- the join table a position column and make it the single source of truth.
ALTER TABLE public.exercises_routines ADD COLUMN position INT;

-- Routines with a populated exercise_order keep exactly the order they have.
-- The array is joined on its text form so a malformed entry is skipped rather
-- than aborting the migration on an invalid UUID cast.
UPDATE public.exercises_routines er
SET position = ordered.position
FROM (SELECT r.id AS routine_id, o.exercise_id, o.position
      FROM public.routines r,
           jsonb_array_elements_text(r.exercise_order) WITH ORDINALITY AS o(exercise_id, position)) ordered
WHERE er.routine_id = ordered.routine_id
  AND er.exercise_id::text = ordered.exercise_id;

-- Exercises the array omits — every exercise of a routine whose order is '[]',
-- plus any stragglers — are appended after the ordered ones in the title-then-ID
-- order the read path already renders them in, so nothing visibly moves.
UPDATE public.exercises_routines er
SET position = fallback.position
FROM (SELECT er2.routine_id,
             er2.exercise_id,
             COALESCE(m.max_position, 0) + ROW_NUMBER() OVER (
                 PARTITION BY er2.routine_id
                 ORDER BY e.title, e.id
                 ) AS position
      FROM public.exercises_routines er2
               JOIN public.exercises e ON e.id = er2.exercise_id
               LEFT JOIN (SELECT routine_id, MAX(position) AS max_position
                          FROM public.exercises_routines
                          GROUP BY routine_id) m ON m.routine_id = er2.routine_id
      WHERE er2.position IS NULL) fallback
WHERE er.routine_id = fallback.routine_id
  AND er.exercise_id = fallback.exercise_id;

ALTER TABLE public.exercises_routines ALTER COLUMN position SET NOT NULL;

ALTER TABLE public.routines DROP COLUMN exercise_order;
