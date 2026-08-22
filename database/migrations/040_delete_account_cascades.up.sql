-- Account deletion erases everything an account owns, and the ownership graph
-- is deep: auth → users → routines/exercises/workouts/plans → sets, comments,
-- join rows. Expressing it as ON DELETE CASCADE lets one DELETE on the auth row
-- clear the account, instead of a hand-ordered sweep that silently rots as
-- tables are added.
--
-- Only the edges that point at an owner are changed. workouts.routine_id keeps
-- its ON DELETE SET NULL so deleting a routine still leaves the workouts logged
-- against it intact.

ALTER TABLE public.users
    DROP CONSTRAINT users_auth_id_fkey,
    ADD CONSTRAINT users_auth_id_fkey
        FOREIGN KEY (auth_id) REFERENCES public.auth (id) ON DELETE CASCADE;

ALTER TABLE public.routines
    DROP CONSTRAINT routines_user_id_fkey,
    ADD CONSTRAINT routines_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;

ALTER TABLE public.exercises
    DROP CONSTRAINT exercises_user_id_fkey,
    ADD CONSTRAINT exercises_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;

ALTER TABLE public.workouts
    DROP CONSTRAINT workouts_user_id_fkey,
    ADD CONSTRAINT workouts_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;

ALTER TABLE public.plans
    DROP CONSTRAINT plans_user_id_fkey,
    ADD CONSTRAINT plans_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;

ALTER TABLE public.notifications
    DROP CONSTRAINT notifications_user_id_fkey,
    ADD CONSTRAINT notifications_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;

-- Both directions: leaving the app takes the follows with it, either way round.
ALTER TABLE public.followers
    DROP CONSTRAINT followers_follower_id_fkey,
    ADD CONSTRAINT followers_follower_id_fkey
        FOREIGN KEY (follower_id) REFERENCES public.users (id) ON DELETE CASCADE,
    DROP CONSTRAINT followers_followee_id_fkey,
    ADD CONSTRAINT followers_followee_id_fkey
        FOREIGN KEY (followee_id) REFERENCES public.users (id) ON DELETE CASCADE;

-- A comment dies with its author and with the workout it was left on, so
-- deleting either party clears the conversation between them.
ALTER TABLE public.workout_comments
    DROP CONSTRAINT workout_comments_user_id_fkey,
    ADD CONSTRAINT workout_comments_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE,
    DROP CONSTRAINT workout_comments_workout_id_fkey,
    ADD CONSTRAINT workout_comments_workout_id_fkey
        FOREIGN KEY (workout_id) REFERENCES public.workouts (id) ON DELETE CASCADE;

ALTER TABLE public.sets
    DROP CONSTRAINT sets_workout_id_fkey,
    ADD CONSTRAINT sets_workout_id_fkey
        FOREIGN KEY (workout_id) REFERENCES public.workouts (id) ON DELETE CASCADE,
    DROP CONSTRAINT sets_exercise_id_fkey,
    ADD CONSTRAINT sets_exercise_id_fkey
        FOREIGN KEY (exercise_id) REFERENCES public.exercises (id) ON DELETE CASCADE;

ALTER TABLE public.exercises_routines
    DROP CONSTRAINT routine_exercises_routine_id_fkey,
    ADD CONSTRAINT routine_exercises_routine_id_fkey
        FOREIGN KEY (routine_id) REFERENCES public.routines (id) ON DELETE CASCADE,
    DROP CONSTRAINT routine_exercises_exercise_id_fkey,
    ADD CONSTRAINT routine_exercises_exercise_id_fkey
        FOREIGN KEY (exercise_id) REFERENCES public.exercises (id) ON DELETE CASCADE;

ALTER TABLE public.plan_routines
    DROP CONSTRAINT plan_routines_routine_id_fkey,
    ADD CONSTRAINT plan_routines_routine_id_fkey
        FOREIGN KEY (routine_id) REFERENCES public.routines (id) ON DELETE CASCADE;
