ALTER TABLE public.users
    ADD COLUMN weight_unit VARCHAR(2) NOT NULL DEFAULT 'kg'
        CHECK (weight_unit IN ('kg', 'lb'));

-- Weight remains stored canonically in kilograms. The unit records how the
-- athlete entered the value so the API can return the original measurement.
ALTER TABLE public.sets
    ADD COLUMN weight_unit VARCHAR(2) NOT NULL DEFAULT 'kg'
        CHECK (weight_unit IN ('kg', 'lb'));
