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

INSERT INTO getstronger.users VALUES ('9b098e4e-cfda-4b29-a58b-6c6c742ed023', 'Christian', 'Carlsson', '2024-11-22 14:49:35.432824');
