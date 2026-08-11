ALTER TABLE public.auth
    ADD COLUMN password_reset_token UUID NULL;
