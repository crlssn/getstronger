package payloads

type RequestTraced struct {
	Request    string
	DurationMS int
	StatusCode int
}

type WorkoutCommentPosted struct {
	CommentID string
}

type UserFollowed struct {
	FollowerID string
	FolloweeID string
}
