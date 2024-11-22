--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4 (Debian 16.4-1.pgdg120+1)
-- Dumped by pg_dump version 16.6 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: getstronger; Type: SCHEMA; Schema: -; Owner: root
--

CREATE SCHEMA getstronger;


ALTER SCHEMA getstronger OWNER TO root;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auth; Type: TABLE; Schema: getstronger; Owner: root
--

CREATE TABLE getstronger.auth (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying(128) NOT NULL,
    password bytea NOT NULL,
    refresh_token character varying(256),
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE getstronger.auth OWNER TO root;

--
-- Name: exercises; Type: TABLE; Schema: getstronger; Owner: root
--

CREATE TABLE getstronger.exercises (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    title character varying NOT NULL,
    sub_title character varying,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    deleted_at timestamp without time zone
);


ALTER TABLE getstronger.exercises OWNER TO root;

--
-- Name: routine_exercises; Type: TABLE; Schema: getstronger; Owner: root
--

CREATE TABLE getstronger.routine_exercises (
    routine_id uuid NOT NULL,
    exercise_id uuid NOT NULL
);


ALTER TABLE getstronger.routine_exercises OWNER TO root;

--
-- Name: routines; Type: TABLE; Schema: getstronger; Owner: root
--

CREATE TABLE getstronger.routines (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    title character varying NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    deleted_at timestamp without time zone,
    exercise_order jsonb
);


ALTER TABLE getstronger.routines OWNER TO root;

--
-- Name: sets; Type: TABLE; Schema: getstronger; Owner: root
--

CREATE TABLE getstronger.sets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    workout_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    weight real NOT NULL,
    reps integer NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE getstronger.sets OWNER TO root;

--
-- Name: users; Type: TABLE; Schema: getstronger; Owner: root
--

CREATE TABLE getstronger.users (
    id uuid NOT NULL,
    first_name character varying NOT NULL,
    last_name character varying NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE getstronger.users OWNER TO root;

--
-- Name: workouts; Type: TABLE; Schema: getstronger; Owner: root
--

CREATE TABLE getstronger.workouts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    finished_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    name character varying NOT NULL
);


ALTER TABLE getstronger.workouts OWNER TO root;

--
-- Data for Name: auth; Type: TABLE DATA; Schema: getstronger; Owner: root
--

INSERT INTO getstronger.auth VALUES ('9b098e4e-cfda-4b29-a58b-6c6c742ed023', 'hello@crlssn.com', '\x24326124313024777a6b715375594a50736c4e75704a6a5a59422e437533576332654a4a2f5674686e76464f36344d504b4b7a6d6c6d706a51687232', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5YjA5OGU0ZS1jZmRhLTRiMjktYTU4Yi02YzZjNzQyZWQwMjMiLCJzdWIiOiJyZWZyZXNoX3Rva2VuIiwiZXhwIjoxNzM0ODc4OTgwLCJpYXQiOjE3MzIyODY5ODB9.Bz6vCi_-1MJZMeY_ID9TEMuzOV-yeO63vvw12LSzT5c', '2024-11-22 14:49:35.424053');


--
-- Data for Name: exercises; Type: TABLE DATA; Schema: getstronger; Owner: root
--

INSERT INTO getstronger.exercises VALUES ('480539b7-3c4e-4715-8435-7ac8b0a06eeb', '9b098e4e-cfda-4b29-a58b-6c6c742ed023', 'Bench press', NULL, '2024-11-22 14:49:50.53486', NULL);
INSERT INTO getstronger.exercises VALUES ('f8aff810-c189-4309-a134-7de5e9c19291', '9b098e4e-cfda-4b29-a58b-6c6c742ed023', 'Deadlifts', NULL, '2024-11-22 14:49:54.354296', NULL);
INSERT INTO getstronger.exercises VALUES ('d9067c1d-358e-484a-aa68-550c1525774b', '9b098e4e-cfda-4b29-a58b-6c6c742ed023', 'Squats', NULL, '2024-11-22 14:49:57.068807', NULL);


--
-- Data for Name: routine_exercises; Type: TABLE DATA; Schema: getstronger; Owner: root
--

INSERT INTO getstronger.routine_exercises VALUES ('5f2a8266-ef46-4e78-8fb1-7d8c076dff3d', '480539b7-3c4e-4715-8435-7ac8b0a06eeb');
INSERT INTO getstronger.routine_exercises VALUES ('5f2a8266-ef46-4e78-8fb1-7d8c076dff3d', 'f8aff810-c189-4309-a134-7de5e9c19291');
INSERT INTO getstronger.routine_exercises VALUES ('5f2a8266-ef46-4e78-8fb1-7d8c076dff3d', 'd9067c1d-358e-484a-aa68-550c1525774b');


--
-- Data for Name: routines; Type: TABLE DATA; Schema: getstronger; Owner: root
--

INSERT INTO getstronger.routines VALUES ('5f2a8266-ef46-4e78-8fb1-7d8c076dff3d', '9b098e4e-cfda-4b29-a58b-6c6c742ed023', 'Full body', '2024-11-22 14:50:05.447634', NULL, '["f8aff810-c189-4309-a134-7de5e9c19291", "480539b7-3c4e-4715-8435-7ac8b0a06eeb", "d9067c1d-358e-484a-aa68-550c1525774b"]');


--
-- Data for Name: sets; Type: TABLE DATA; Schema: getstronger; Owner: root
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: getstronger; Owner: root
--

INSERT INTO getstronger.users VALUES ('9b098e4e-cfda-4b29-a58b-6c6c742ed023', 'C', 'C', '2024-11-22 14:49:35.432824');


--
-- Data for Name: workouts; Type: TABLE DATA; Schema: getstronger; Owner: root
--



--
-- Name: auth auth_email_key; Type: CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.auth
    ADD CONSTRAINT auth_email_key UNIQUE (email);


--
-- Name: auth auth_pkey; Type: CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.auth
    ADD CONSTRAINT auth_pkey PRIMARY KEY (id);


--
-- Name: exercises exercises_pkey; Type: CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.exercises
    ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);


--
-- Name: routine_exercises routine_exercises_pkey; Type: CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.routine_exercises
    ADD CONSTRAINT routine_exercises_pkey PRIMARY KEY (routine_id, exercise_id);


--
-- Name: routines routines_pkey; Type: CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.routines
    ADD CONSTRAINT routines_pkey PRIMARY KEY (id);


--
-- Name: sets sets_pkey; Type: CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.sets
    ADD CONSTRAINT sets_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: workouts workouts_pkey; Type: CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.workouts
    ADD CONSTRAINT workouts_pkey PRIMARY KEY (id);


--
-- Name: exercises exercises_user_id_fkey; Type: FK CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.exercises
    ADD CONSTRAINT exercises_user_id_fkey FOREIGN KEY (user_id) REFERENCES getstronger.users(id);


--
-- Name: routine_exercises routine_exercises_exercise_id_fkey; Type: FK CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.routine_exercises
    ADD CONSTRAINT routine_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES getstronger.exercises(id);


--
-- Name: routine_exercises routine_exercises_routine_id_fkey; Type: FK CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.routine_exercises
    ADD CONSTRAINT routine_exercises_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES getstronger.routines(id);


--
-- Name: routines routines_user_id_fkey; Type: FK CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.routines
    ADD CONSTRAINT routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES getstronger.users(id);


--
-- Name: sets sets_exercise_id_fkey; Type: FK CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.sets
    ADD CONSTRAINT sets_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES getstronger.exercises(id);


--
-- Name: sets sets_workout_id_fkey; Type: FK CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.sets
    ADD CONSTRAINT sets_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES getstronger.workouts(id);


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES getstronger.auth(id);


--
-- Name: workouts workouts_user_id_fkey; Type: FK CONSTRAINT; Schema: getstronger; Owner: root
--

ALTER TABLE ONLY getstronger.workouts
    ADD CONSTRAINT workouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES getstronger.users(id);


--
-- PostgreSQL database dump complete
--

