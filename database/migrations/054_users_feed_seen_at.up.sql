-- When the athlete last had the home feed in front of them. A workout a
-- followed account logged after this moment is highlighted as new until the
-- feed is shown again; nullable, because an account that has never opened
-- the feed has nothing to catch up on.
ALTER TABLE public.users
    ADD COLUMN feed_seen_at TIMESTAMP NULL;
