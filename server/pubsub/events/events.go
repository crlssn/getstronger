// Package events is the vocabulary of things worth telling the rest of the
// system about: the topics they are published under and the facts each one
// carries. Publishers and subscribers agree here and nowhere else.
package events

import (
	"github.com/crlssn/getstronger/server/gen/models/enums"
)

// Topic names a kind of event. The database stores topics as an enum, so the
// generated values are the vocabulary; these names read better at call sites.
type Topic = enums.EventTopic

const (
	TopicFollowedUser         = enums.EventTopicFolloweduser
	TopicRequestTraced        = enums.EventTopicRequesttraced
	TopicWorkoutCommentPosted = enums.EventTopicWorkoutcommentposted
)

// RequestTraced reports how long a request took and how it ended.
type RequestTraced struct {
	Request    string `json:"request"`
	DurationMS int    `json:"durationMs"`
	StatusCode int    `json:"statusCode"`
}

// WorkoutCommentPosted reports that somebody commented on a workout.
type WorkoutCommentPosted struct {
	CommentID string `json:"commentId"`
	EventID   string `json:"eventId"`
}

// UserFollowed reports that one athlete started following another.
type UserFollowed struct {
	FollowerID string `json:"followerId"`
	FolloweeID string `json:"followeeId"`
	EventID    string `json:"eventId"`
}
