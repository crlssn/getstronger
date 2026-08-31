-- plans.current_position is an index into the dense rotation the app builds
-- from plan_routines, and only the plan editor kept it dense. Deleting a
-- routine cascaded its plan_routines row away, leaving a gap in the stored
-- positions: the plan then offered the wrong routine, or pointed past the end
-- of its own rotation and stopped rotating for good. Routines are retired
-- rather than erased now, so no new gap can open; this repairs the ones
-- already there.
--
-- A rotation that merely shifted cannot be recovered — which routine the
-- athlete was on is not recorded anywhere — so the repair is bounded: make the
-- positions dense again, and bring any plan pointing past its rotation back to
-- the start, the same answer the app gives when a rotation loses the routine
-- it was on.

-- The rows move aside before they take their new places: the primary key is
-- (plan_id, position), so re-packing in place would collide with a position
-- another row in the same plan still holds.
UPDATE public.plan_routines
SET position = position + 1000000;

WITH packed AS (SELECT plan_id,
                       routine_id,
                       ROW_NUMBER() OVER (PARTITION BY plan_id ORDER BY position) - 1 AS position
                FROM public.plan_routines)
UPDATE public.plan_routines pr
SET position = packed.position
FROM packed
WHERE pr.plan_id = packed.plan_id
  AND pr.routine_id = packed.routine_id;

UPDATE public.plans p
SET current_position = 0
WHERE p.current_position >= (SELECT COUNT(*) FROM public.plan_routines pr WHERE pr.plan_id = p.id);

-- A plan with nothing left to train cannot say what comes next, so it is no
-- longer the plan the athlete is following.
UPDATE public.plans p
SET active = FALSE
WHERE p.active
  AND NOT EXISTS (SELECT 1 FROM public.plan_routines pr WHERE pr.plan_id = p.id);
