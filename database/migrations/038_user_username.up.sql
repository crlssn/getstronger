-- Every user gets a unique handle. Existing accounts are backfilled from the
-- first word of their name, stripped down to the characters a username may
-- contain, with numeric suffixes deduplicating shared first words.
ALTER TABLE public.users
    ADD COLUMN username VARCHAR(30);

WITH candidates AS (
    SELECT id,
           CASE WHEN cleaned = '' THEN 'user' ELSE left(cleaned, 24) END AS base
    FROM (
        SELECT id,
               regexp_replace(lower(split_part(name, ' ', 1)), '[^a-z0-9_.]', '', 'g') AS cleaned
        FROM public.users
    ) AS stripped
),
numbered AS (
    SELECT id,
           base,
           ROW_NUMBER() OVER (PARTITION BY base ORDER BY id) AS occurrence
    FROM candidates
)
UPDATE public.users u
SET username = CASE WHEN n.occurrence = 1 THEN n.base ELSE n.base || n.occurrence::text END
FROM numbered n
WHERE u.id = n.id;

-- A first word that itself ends in a digit can collide with a suffixed
-- neighbour; any residual duplicate gets a deterministic tail from its id.
UPDATE public.users u
SET username = left(u.username, 22) || '_' || substr(md5(u.id::text), 1, 6)
WHERE EXISTS (
    SELECT 1
    FROM public.users other
    WHERE other.id < u.id
      AND lower(other.username) = lower(u.username)
);

ALTER TABLE public.users
    ALTER COLUMN username SET NOT NULL;

-- Handles are compared case-insensitively even though the application stores
-- them lowercased; the index enforces that at the source of truth.
CREATE UNIQUE INDEX idx_users_username_lower ON public.users (lower(username));
