-- Promoting a record reads what the pair already holds in the transaction's
-- own snapshot, so two saves for one athlete and one exercise each decided the
-- record without seeing the other, and whichever committed second stored its
-- own answer whatever the first had found: a 120 kg set replacing a 150 kg
-- record, and staying there, because promotion never reads the history again.
--
-- Guarding the upsert does not fix it. ON CONFLICT DO UPDATE does see the
-- newest version of the row it conflicts with, but the sets and exercises a
-- guard has to join to rank that row are read in the statement's own snapshot,
-- where the winner's set does not exist yet — so the guard refuses a promotion
-- that should happen as readily as one that should not.
--
-- So a pair is decided one transaction at a time. Each promotion takes the
-- pair's lock before reading what it holds, in the pairs' own order so two
-- statements cannot take them in opposite ones and wait on each other. The
-- lock is released at commit, which is when the record it wrote becomes
-- visible, so the promotion behind it reads that record and ranks its own sets
-- against it — which is what the ordering below already does.
--
-- Losing a set still re-derives the record from the history and is unchanged.
-- A refresh that loses this race is corrected by the next one; a promotion
-- that lost it was permanent.
CREATE OR REPLACE FUNCTION public.sets_promote_personal_bests()
    RETURNS trigger
    LANGUAGE plpgsql
AS
$$
DECLARE
    _pair RECORD;
BEGIN
    FOR _pair IN SELECT DISTINCT user_id, exercise_id
                 FROM changed_sets
                 ORDER BY user_id, exercise_id
        LOOP
            -- An advisory lock rather than a row lock: the pair being promoted
            -- for the first time has no row to lock, which is the race at its
            -- widest.
            PERFORM pg_advisory_xact_lock(hashtext(_pair.user_id::TEXT), hashtext(_pair.exercise_id::TEXT));
        END LOOP;

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
