-- A personal best was derived on every read: list every workout the athlete
-- owns, then run DISTINCT ON (exercise_id) over every set in them to return
-- one row per exercise. It costs what the athlete has trained rather than what
-- is being asked for, on the dashboard, inside every set list, and — worst —
-- on the feed, where the owners of one page of workouts are passed in
-- together and the cost is the sum of their histories.
--
-- So the record is stored, keyed by the pair that holds it, and the triggers
-- below keep it current.
--
-- 010 stored the same thing as a view, which derived it on read like the query
-- this replaces, and 019 dropped it.

CREATE TABLE public.personal_bests
(
    user_id     UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES public.exercises (id) ON DELETE CASCADE,
    set_id      UUID NOT NULL REFERENCES public.sets (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, exercise_id)
);

-- The primary key already leads with user_id, so the cascade from users reads
-- it. The other two references need their own.
CREATE INDEX personal_bests_exercise_id_idx ON public.personal_bests (exercise_id);
CREATE INDEX personal_bests_set_id_idx ON public.personal_bests (set_id);

-- What makes one set better than another is the exercise's own measurements: a
-- lift is the heaviest set, a row measured by distance the longest, and a
-- metric the exercise does not carry cannot decide anything. Ranking them as an
-- array puts that in one place — arrays compare element by element, so the
-- largest array is the best set, and every query below orders by it rather than
-- restating the rule.
CREATE FUNCTION public.personal_best_rank(_metrics TEXT[], _weight DOUBLE PRECISION, _reps INT,
                                          _distance DOUBLE PRECISION, _duration_seconds INT)
    RETURNS DOUBLE PRECISION[]
    LANGUAGE sql
    IMMUTABLE
    PARALLEL SAFE
AS
$$
SELECT ARRAY [
    CASE WHEN 'weight' = ANY (_metrics) THEN _weight ELSE 0 END,
    CASE WHEN 'reps' = ANY (_metrics) THEN _reps ELSE 0 END,
    CASE WHEN 'distance' = ANY (_metrics) THEN _distance ELSE 0 END,
    CASE WHEN 'time' = ANY (_metrics) THEN _duration_seconds ELSE 0 END
    ];
$$;

-- Ties go to the earliest set: a record is set the first time it is reached,
-- not re-set by every repeat of it. created_at cannot order them alone — every
-- set of a workout is written in one transaction and shares it to the
-- microsecond — so position, which 049 added for exactly this, orders the run
-- of sets within the workout, and the id settles the remainder deterministically
-- rather than leaving it to whichever row the planner reached first.
--
-- refresh_personal_bests rewrites what each named pair holds by reading all of
-- its sets. The two arrays are read pairwise; duplicates are fine.
CREATE FUNCTION public.refresh_personal_bests(_user_ids UUID[], _exercise_ids UUID[])
    RETURNS void
    LANGUAGE sql
AS
$$
WITH pairs AS (SELECT DISTINCT p.user_id, p.exercise_id
               FROM unnest(_user_ids, _exercise_ids) AS p(user_id, exercise_id)),
     best AS (SELECT DISTINCT ON (s.user_id, s.exercise_id) s.user_id, s.exercise_id, s.id AS set_id
              FROM pairs p
                       JOIN public.sets s ON s.user_id = p.user_id AND s.exercise_id = p.exercise_id
                       JOIN public.exercises e ON e.id = s.exercise_id
              ORDER BY s.user_id,
                       s.exercise_id,
                       public.personal_best_rank(e.metrics, s.weight, s.reps, s.distance, s.duration_seconds) DESC,
                       s.created_at,
                       s.position,
                       s.id),
     -- A pair whose last set is gone holds no record any more.
     retired AS (
         DELETE FROM public.personal_bests pb
             USING pairs p
             WHERE pb.user_id = p.user_id
                 AND pb.exercise_id = p.exercise_id
                 AND NOT EXISTS (SELECT 1
                                 FROM best b
                                 WHERE b.user_id = pb.user_id
                                   AND b.exercise_id = pb.exercise_id))
INSERT
INTO public.personal_bests (user_id, exercise_id, set_id)
SELECT user_id, exercise_id, set_id
FROM best
ON CONFLICT (user_id, exercise_id) DO UPDATE SET set_id = EXCLUDED.set_id;
$$;

-- Statement triggers rather than row triggers: a workout is saved as one
-- multi-row insert and deleted as one delete, and a transition table turns
-- each into a single pass over the pairs it touched.

-- Saving a workout is the common case, and it does not need the history. The
-- stored record is already the best of everything written before, so the new
-- best is the best of it and the sets just added — which is what a stored
-- record is for. Reading the history back here would put the cost this
-- migration removes from the read path onto the write path instead.
CREATE FUNCTION public.sets_promote_personal_bests()
    RETURNS trigger
    LANGUAGE plpgsql
AS
$$
BEGIN
    WITH pairs AS (SELECT DISTINCT user_id, exercise_id FROM changed_sets),
         candidates AS (SELECT c.user_id, c.exercise_id, c.id, c.weight, c.reps, c.distance,
                               c.duration_seconds, c.created_at, c.position
                        FROM changed_sets c
                        UNION ALL
                        SELECT s.user_id, s.exercise_id, s.id, s.weight, s.reps, s.distance,
                               s.duration_seconds, s.created_at, s.position
                        FROM pairs p
                                 JOIN public.personal_bests pb
                                      ON pb.user_id = p.user_id AND pb.exercise_id = p.exercise_id
                                 JOIN public.sets s ON s.id = pb.set_id),
         best AS (SELECT DISTINCT ON (c.user_id, c.exercise_id) c.user_id, c.exercise_id, c.id AS set_id
                  FROM candidates c
                           JOIN public.exercises e ON e.id = c.exercise_id
                  ORDER BY c.user_id,
                           c.exercise_id,
                           public.personal_best_rank(e.metrics, c.weight, c.reps, c.distance, c.duration_seconds) DESC,
                           c.created_at,
                           c.position,
                           c.id)
    INSERT
    INTO public.personal_bests (user_id, exercise_id, set_id)
    SELECT user_id, exercise_id, set_id
    FROM best
    ON CONFLICT (user_id, exercise_id) DO UPDATE SET set_id = EXCLUDED.set_id;

    RETURN NULL;
END;
$$;

-- Losing a set is the case that does need the history: the record it held has
-- to be replaced by the best of what is left, and only the rest of the sets
-- know what that is. Deleting a workout is rare enough to pay for it.
CREATE FUNCTION public.sets_refresh_personal_bests()
    RETURNS trigger
    LANGUAGE plpgsql
AS
$$
DECLARE
    _user_ids     UUID[];
    _exercise_ids UUID[];
BEGIN
    SELECT array_agg(p.user_id), array_agg(p.exercise_id)
    INTO _user_ids, _exercise_ids
    FROM (SELECT DISTINCT user_id, exercise_id FROM changed_sets) p;

    IF _user_ids IS NOT NULL THEN
        PERFORM public.refresh_personal_bests(_user_ids, _exercise_ids);
    END IF;

    RETURN NULL;
END;
$$;

-- What an exercise is measured by is what decides its best set, so a change to
-- it re-decides every record held for that exercise. A trigger carrying a
-- transition table cannot also name the column it watches, so the two tables
-- are compared here instead — which is what keeps a rename or a retag from
-- rewriting records that did not change.
CREATE FUNCTION public.exercises_refresh_personal_bests()
    RETURNS trigger
    LANGUAGE plpgsql
AS
$$
DECLARE
    _user_ids     UUID[];
    _exercise_ids UUID[];
BEGIN
    SELECT array_agg(p.user_id), array_agg(p.exercise_id)
    INTO _user_ids, _exercise_ids
    FROM (SELECT DISTINCT s.user_id, s.exercise_id
          FROM changed_exercises c
                   JOIN previous_exercises o ON o.id = c.id AND o.metrics IS DISTINCT FROM c.metrics
                   JOIN public.sets s ON s.exercise_id = c.id) p;

    IF _user_ids IS NOT NULL THEN
        PERFORM public.refresh_personal_bests(_user_ids, _exercise_ids);
    END IF;

    RETURN NULL;
END;
$$;

CREATE TRIGGER personal_bests_on_set_insert
    AFTER INSERT
    ON public.sets
    REFERENCING NEW TABLE AS changed_sets
    FOR EACH STATEMENT
EXECUTE FUNCTION public.sets_promote_personal_bests();

-- The set that held a record being deleted takes the record's row with it,
-- through the reference above. Whether that cascade runs before this trigger
-- or after it, the pair ends up on the set the refresh chose: the deleted set
-- can never be that set, so a cascade running second finds nothing to remove.
CREATE TRIGGER personal_bests_on_set_delete
    AFTER DELETE
    ON public.sets
    REFERENCING OLD TABLE AS changed_sets
    FOR EACH STATEMENT
EXECUTE FUNCTION public.sets_refresh_personal_bests();

-- An update can move a set between pairs or make the record it holds no longer
-- the best, so both the pair it left and the one it joined are re-derived. One
-- trigger cannot name two transition tables under the name the function reads,
-- hence two.
CREATE TRIGGER personal_bests_on_set_update_from
    AFTER UPDATE
    ON public.sets
    REFERENCING OLD TABLE AS changed_sets
    FOR EACH STATEMENT
EXECUTE FUNCTION public.sets_refresh_personal_bests();

CREATE TRIGGER personal_bests_on_set_update_to
    AFTER UPDATE
    ON public.sets
    REFERENCING NEW TABLE AS changed_sets
    FOR EACH STATEMENT
EXECUTE FUNCTION public.sets_refresh_personal_bests();

CREATE TRIGGER personal_bests_on_exercise_metrics
    AFTER UPDATE
    ON public.exercises
    REFERENCING OLD TABLE AS previous_exercises NEW TABLE AS changed_exercises
    FOR EACH STATEMENT
EXECUTE FUNCTION public.exercises_refresh_personal_bests();

-- The backfill is the same refresh over every pair that has a set, so what
-- history gets is what a save from here on gets.
WITH pairs AS (SELECT DISTINCT user_id, exercise_id FROM public.sets)
SELECT public.refresh_personal_bests(array_agg(user_id), array_agg(exercise_id))
FROM pairs;
