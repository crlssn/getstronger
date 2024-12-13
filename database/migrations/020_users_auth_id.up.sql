ALTER TABLE getstronger.users ADD COLUMN auth_id UUID NULL REFERENCES getstronger.auth (id);
UPDATE getstronger.users SET auth_id = auth.id FROM getstronger.auth WHERE users.id = auth.id;

ALTER TABLE getstronger.users ALTER COLUMN auth_id SET NOT NULL;
ALTER TABLE getstronger.users DROP CONSTRAINT users_id_fkey;
ALTER TABLE getstronger.users ALTER COLUMN id SET DEFAULT uuid_generate_v4();

