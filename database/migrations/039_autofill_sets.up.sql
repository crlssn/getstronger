-- Copying previous-session values into an empty set input on focus becomes a
-- per-user preference, off by default: a prefilled value that was not typed
-- surprises more athletes than it helps.
ALTER TABLE public.users
    ADD COLUMN autofill_sets BOOLEAN NOT NULL DEFAULT FALSE;
