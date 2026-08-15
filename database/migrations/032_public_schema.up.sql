-- Existing installations created application objects in the getstronger schema.
-- Fresh installations already create them in public, so this migration is a no-op there.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'getstronger') THEN
        ALTER TYPE getstronger.notification_type SET SCHEMA public;
        ALTER TYPE getstronger.event_topic SET SCHEMA public;

        ALTER TABLE getstronger.auth SET SCHEMA public;
        ALTER TABLE getstronger.users SET SCHEMA public;
        ALTER TABLE getstronger.routines SET SCHEMA public;
        ALTER TABLE getstronger.exercises SET SCHEMA public;
        ALTER TABLE getstronger.exercises_routines SET SCHEMA public;
        ALTER TABLE getstronger.workouts SET SCHEMA public;
        ALTER TABLE getstronger.sets SET SCHEMA public;
        ALTER TABLE getstronger.followers SET SCHEMA public;
        ALTER TABLE getstronger.workout_comments SET SCHEMA public;
        ALTER TABLE getstronger.traces SET SCHEMA public;
        ALTER TABLE getstronger.notifications SET SCHEMA public;
        ALTER TABLE getstronger.events SET SCHEMA public;
        ALTER TABLE getstronger.plans SET SCHEMA public;
        ALTER TABLE getstronger.plan_routines SET SCHEMA public;

        DROP SCHEMA getstronger;
    END IF;
END $$;
