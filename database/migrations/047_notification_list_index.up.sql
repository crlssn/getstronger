-- idx_notifications_user_id_created_at has been on (user_id, read_at) since the
-- table was created in 015. The name is the one the notification list needs and
-- the columns are the ones the unread count needs, so the count has been served
-- all along and the list never has: it reads every notification a user owns and
-- sorts them to show the newest twenty.
--
-- Both indexes earn their place, so the name moves to the columns it describes
-- and the list gets the index its old name promised. At 5,000 notifications the
-- first page drops from 1.8 ms to 0.3 ms, and a later page from 2.3 ms to
-- 0.2 ms; the cost it sheds is the one that grew with the account's age.

ALTER INDEX public.idx_notifications_user_id_created_at
    RENAME TO idx_notifications_user_id_read_at;

CREATE INDEX idx_notifications_user_id_created_at
    ON public.notifications (user_id, created_at);
