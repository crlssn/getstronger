// Package notification is the notifications bounded context: what an athlete is
// told about, and who gets told.
//
// The package owns those rules. Storing a notification, delivering it and
// rendering it for the API happen elsewhere.
package notification

import (
	"cmp"
	"slices"

	"github.com/gofrs/uuid/v5"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/gen/models/enums"
)

// Type is what a notification is about. The database stores types as an enum,
// so the generated values are the vocabulary; these names read better at call
// sites.
type Type = enums.NotificationType

const (
	TypeFollow         = enums.NotificationTypeFollow
	TypeWorkoutComment = enums.NotificationTypeWorkoutcomment
)

// Payload carries whatever the reader needs to look up to render the
// notification. It is stored as JSON, so its field names are part of the
// contract with every notification already written.
type Payload struct {
	ActorID   string `json:"actorId,omitempty"`
	EventID   string `json:"eventId,omitempty"`
	WorkoutID string `json:"workoutId,omitempty"`
}

// CommentAudience is who hears about a new comment on a workout: the athlete
// whose workout it is, plus everyone already in the conversation. Nobody is
// notified about their own comment, and nobody is notified twice.
func CommentAudience(commenterID, workoutOwnerID uuid.UUID, comments models.WorkoutCommentSlice) []uuid.UUID {
	audience := make(map[uuid.UUID]struct{}, len(comments)+1)
	if commenterID != workoutOwnerID {
		audience[workoutOwnerID] = struct{}{}
	}

	for _, comment := range comments {
		if comment.UserID == commenterID {
			continue
		}
		audience[comment.UserID] = struct{}{}
	}

	recipients := make([]uuid.UUID, 0, len(audience))
	for userID := range audience {
		recipients = append(recipients, userID)
	}

	// Map iteration is unordered; a stable audience keeps the notifications a
	// single comment produces reproducible.
	slices.SortFunc(recipients, func(a, b uuid.UUID) int {
		return cmp.Compare(a.String(), b.String())
	})

	return recipients
}
