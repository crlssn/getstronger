-- Mail providers deliver Alice@example.com and alice@example.com to the same
-- mailbox, so the application folds addresses to lowercase before storing or
-- looking one up; the index enforces that at the source of truth.

-- Case-variant rows cannot be resolved here: merging or disabling one of a pair
-- takes an athlete's workout history with it. Stop the migration instead, so
-- each pair is decided on deliberately and resolved by a follow-up migration.
DO $$
DECLARE
    collisions text;
BEGIN
    SELECT string_agg(address, ', ' ORDER BY address)
    INTO collisions
    FROM (
        SELECT lower(email) AS address
        FROM public.auth
        GROUP BY lower(email)
        HAVING count(*) > 1
    ) AS duplicates;

    IF collisions IS NOT NULL THEN
        RAISE EXCEPTION 'auth rows hold case-variant duplicates of: %', collisions;
    END IF;
END
$$;

UPDATE public.auth
SET email = lower(email)
WHERE email <> lower(email);

CREATE UNIQUE INDEX idx_auth_email_lower ON public.auth (lower(email));
