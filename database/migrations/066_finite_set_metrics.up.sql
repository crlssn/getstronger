-- Postgres sorts NaN above every other double, and the personal best is the
-- set that sorts first (059), so a set carrying a non-finite weight took the
-- record for its exercise and no later set could ever reclaim it.
--
-- A `>=` bound does not exclude one: 'NaN'::FLOAT8 >= 0 is true, which is why
-- sets_distance_non_negative admitted NaN and every infinity. There is no
-- isfinite() for DOUBLE PRECISION, so the bound names the infinities instead —
-- NaN compares greater than every double, so it fails the upper half too.

-- A metric that is not a real number is not a value an athlete entered, and
-- nothing can be recovered from it. Removing it is also what restores the
-- record it was holding: the delete trigger re-derives each affected pair from
-- the sets that are left.
DELETE
FROM public.sets
WHERE NOT (weight > '-Infinity'::DOUBLE PRECISION AND weight < 'Infinity'::DOUBLE PRECISION)
   OR NOT (distance > '-Infinity'::DOUBLE PRECISION AND distance < 'Infinity'::DOUBLE PRECISION);

ALTER TABLE public.sets
    ADD CONSTRAINT sets_weight_finite
        CHECK (weight > '-Infinity'::DOUBLE PRECISION AND weight < 'Infinity'::DOUBLE PRECISION),
    ADD CONSTRAINT sets_distance_finite
        CHECK (distance > '-Infinity'::DOUBLE PRECISION AND distance < 'Infinity'::DOUBLE PRECISION);
