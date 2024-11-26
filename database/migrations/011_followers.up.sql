CREATE TABLE getstronger.followers
(
    follower_id UUID NOT NULL REFERENCES getstronger.users (id),
    followee_id UUID NOT NULL REFERENCES getstronger.users (id),
    PRIMARY KEY (follower_id, followee_id)
);
