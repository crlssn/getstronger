-- A block the athlete named read back as "Block A" once the session was over.
-- The workout keeps its own copy of the blocks it was trained in, and that copy
-- was missing the three columns 060 and 064 gave a routine's blocks: what the
-- athlete called this one, where it sat in an interval session, and whether the
-- repeating block dropped its last exercise on the final round.
--
-- Everything already saved keeps reading by its position, which is what an
-- empty title and no role already mean.

ALTER TABLE public.workout_groups
    ADD COLUMN title                    TEXT                      NOT NULL DEFAULT '' CHECK (char_length(title) <= 60),
    ADD COLUMN role                     public.routine_group_role NULL,
    ADD COLUMN skip_last_on_final_round BOOLEAN                   NOT NULL DEFAULT FALSE;
