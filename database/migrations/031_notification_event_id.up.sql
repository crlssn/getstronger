CREATE UNIQUE INDEX idx_notifications_user_id_event_id
    ON getstronger.notifications (user_id, (payload ->> 'eventId'))
    WHERE payload ? 'eventId';
