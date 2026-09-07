-- A live recording that holds itself while the athlete is standing still, so a
-- city commute is not paced by the red lights it waited at. Off by default: a
-- clock that stops on its own surprises anyone who did not ask for it.
ALTER TABLE public.users
    ADD COLUMN auto_pause BOOLEAN NOT NULL DEFAULT FALSE;
