-- A circuit ran for as many rounds as the session took, so a block prescribed
-- as "three rounds of this" had to be written out as three identical groups.
-- The count belongs to the routine, which is where the prescription is written.
--
-- Zero keeps the open-ended circuit every existing routine already trains: the
-- count is a target the session may go over or stop short of, not a limit.

ALTER TABLE public.routine_groups
    ADD COLUMN rounds INTEGER NOT NULL DEFAULT 0 CHECK (rounds BETWEEN 0 AND 99);
