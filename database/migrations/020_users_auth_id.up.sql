ALTER TABLE public.users ADD COLUMN auth_id UUID NULL REFERENCES public.auth (id);
UPDATE public.users SET auth_id = auth.id FROM public.auth WHERE users.id = auth.id;

ALTER TABLE public.users ALTER COLUMN auth_id SET NOT NULL;
ALTER TABLE public.users ADD CONSTRAINT users_auth_id_key UNIQUE (auth_id);

ALTER TABLE public.users DROP CONSTRAINT users_id_fkey;
ALTER TABLE public.users ALTER COLUMN id SET DEFAULT uuid_generate_v4();
