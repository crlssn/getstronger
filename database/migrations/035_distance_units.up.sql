ALTER TABLE public.users
    ADD COLUMN distance_unit VARCHAR(2) NOT NULL DEFAULT 'km'
        CHECK (distance_unit IN ('km', 'mi'));

-- Distance remains stored canonically in kilometers. The unit records how the
-- athlete entered the value so the API can return the original measurement.
ALTER TABLE public.sets
    ADD COLUMN distance_unit VARCHAR(2) NOT NULL DEFAULT 'km'
        CHECK (distance_unit IN ('km', 'mi'));
