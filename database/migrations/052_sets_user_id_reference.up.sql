-- sets.user_id has named the athlete a set belongs to since 023, where it was
-- added as a bare column and backfilled from the workout. It is the only owner
-- column in the schema that references nothing: every other one has pointed at
-- users with ON DELETE CASCADE since 040. Nothing indexes it either, which is
-- why the rule that every foreign key is indexed never caught it — there is no
-- key to catch.
--
-- Two things follow. The database will not vouch for the athlete a set names,
-- so the only thing keeping it equal to the workout's owner is the application
-- that writes both. And the sets of one athlete cannot be found without
-- reading the table: on 300 athletes with 1.8m sets that is a 72 ms parallel
-- sequential scan, on the API's own ListSets, for a filter every other list
-- answers from an index.

-- The re-derive and the validating ADD each read the table once, which on the
-- 1.8m sets measured above is 375 ms and 271 ms under the one lock the file
-- holds either way. Splitting the ADD across two migrations with NOT VALID is
-- the technique if that ever stops being affordable.

-- The workout's owner is where the column was backfilled from and where the
-- application still copies it from, so re-deriving it both repairs any row
-- that drifted and makes the constraint below safe to add: workouts.user_id
-- already references users, so every value this leaves behind exists.
UPDATE public.sets s
SET user_id = w.user_id
FROM public.workouts w
WHERE w.id = s.workout_id
  AND s.user_id <> w.user_id;

-- Carrying the columns the API's set list pages by, so the one index answers
-- both the cascade's lookup and that list's ordering.
CREATE INDEX sets_user_id_created_at_id_idx
    ON public.sets (user_id, created_at, id);

ALTER TABLE public.sets
    ADD CONSTRAINT sets_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;
