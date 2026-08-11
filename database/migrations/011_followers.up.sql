CREATE TABLE public.followers
(
    follower_id UUID NOT NULL REFERENCES public.users (id),
    followee_id UUID NOT NULL REFERENCES public.users (id),
    PRIMARY KEY (follower_id, followee_id)
);
