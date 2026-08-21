-- Merge the split name columns into one free-form name. The first/last split
-- never matched how names work for everyone, and nothing sorts by last name.
ALTER TABLE public.users
    ADD COLUMN name VARCHAR;

UPDATE public.users
SET name = trim(regexp_replace(first_name || ' ' || last_name, '\s+', ' ', 'g'));

ALTER TABLE public.users
    ALTER COLUMN name SET NOT NULL;

-- The generated search column depends on the split columns, so it has to be
-- rebuilt on the merged name before they can be dropped.
DROP INDEX public.idx_users_full_name_search;

ALTER TABLE public.users
    DROP COLUMN full_name_search,
    DROP COLUMN first_name,
    DROP COLUMN last_name;

ALTER TABLE public.users
    ADD COLUMN full_name_search TEXT GENERATED ALWAYS AS (lower(name)) STORED NOT NULL;

CREATE INDEX idx_users_full_name_search ON public.users USING gin (full_name_search gin_trgm_ops);
