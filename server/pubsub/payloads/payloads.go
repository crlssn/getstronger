package payloads

type RequestTraced struct {
	Request    string `json:"request"`
	DurationMS int    `json:"durationMs"`
	StatusCode int    `json:"statusCode"`
}

type WorkoutCommentPosted struct {
	CommentID string `json:"commentId"`
}

type UserFollowed struct {
	FollowerID string `json:"followerId"`
	FolloweeID string `json:"followeeId"`
}
