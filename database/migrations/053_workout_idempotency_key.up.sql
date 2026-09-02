-- A save the server committed but never answered is sent again: the offline
-- queue replays it on reconnect, and a finish that timed out is pressed
-- again. The client mints one key per session and sends it with every
-- attempt, so a repeat is recognised and answered with the workout it
-- already saved. Nullable: older clients send none, and NULLs are distinct
-- under a unique index, so their workouts are never mistaken for repeats.
ALTER TABLE public.workouts
    ADD COLUMN idempotency_key UUID NULL;

-- An index rather than a constraint: bobgen only lists constraints in its
-- error vocabulary, so the repo names the index when translating a repeat.
CREATE UNIQUE INDEX workouts_user_id_idempotency_key_idx
    ON public.workouts (user_id, idempotency_key);
