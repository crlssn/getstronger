-- A walk-run with a longer first walk had to be built as two groups, one worked
-- once and one repeating, and read back as Group A and Group B with the round
-- numbers restarting. A role says where a block sits in an interval routine —
-- warm-up, the block the round count repeats, cool-down — so the session reads
-- as one numbered sequence instead.
--
-- Null is a block with no such place: every gym circuit, and every routine
-- saved before intervals existed.

CREATE TYPE public.routine_group_role AS ENUM (
    'warmup',
    'repeat',
    'cooldown'
);

ALTER TABLE public.routine_groups
    ADD COLUMN role                     public.routine_group_role NULL,
    -- Only the repeating block reads it: whether its last exercise is dropped
    -- on the final round, so a walk-run ends on the run.
    ADD COLUMN skip_last_on_final_round BOOLEAN                   NOT NULL DEFAULT FALSE;
