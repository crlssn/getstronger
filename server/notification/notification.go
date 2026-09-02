// Package notification is the notifications bounded context: what an athlete is
// told about, and who gets told.
//
// The package owns those rules. Storing a notification, delivering it and
// rendering it for the API happen elsewhere.
package notification

import (
	"cmp"
	"encoding/json"
	"slices"
	"time"

	"github.com/gofrs/uuid/v5"

	"github.com/crlssn/getstronger/server/gen/models/enums"
	"github.com/crlssn/getstronger/server/training"
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
	ActorID   uuid.UUID `json:"actorId,omitempty"`
	EventID   uuid.UUID `json:"eventId,omitempty"`
	WorkoutID uuid.UUID `json:"workoutId,omitempty"`
}

// storedPayload is Payload as it is written: the ids it does not carry are
// left out rather than stored as the nil UUID.
type storedPayload struct {
	ActorID   *uuid.UUID `json:"actorId,omitempty"`
	EventID   *uuid.UUID `json:"eventId,omitempty"`
	WorkoutID *uuid.UUID `json:"workoutId,omitempty"`
}

// MarshalJSON writes only the ids the notification actually names.
//
// encoding/json cannot omit an array, so without this a follow notification
// would store the nil UUID under every key it says nothing about. The unique
// index on (user_id, eventId) covers rows that carry the key at all, so a nil
// id there reads as one event every notification shares.
func (p Payload) MarshalJSON() ([]byte, error) {
	// Three optional ids and nothing else, so there is no error branch to take.
	return json.Marshal(storedPayload{ //nolint:wrapcheck // Nothing here can fail.
		ActorID:   named(p.ActorID),
		EventID:   named(p.EventID),
		WorkoutID: named(p.WorkoutID),
	})
}

// named is the id to store, or nothing when it names no row.
func named(id uuid.UUID) *uuid.UUID {
	if id.IsNil() {
		return nil
	}

	return &id
}

// CommentAudience is who hears about a new comment on a workout: the athlete
// whose workout it is, plus everyone already in the conversation. Nobody is
// notified about their own comment, and nobody is notified twice.
func CommentAudience(commenterID, workoutOwnerID uuid.UUID, comments []*training.WorkoutComment) []uuid.UUID {
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

// Notification is one thing an athlete was told about, and whether they have
// seen it yet.
type Notification struct {
	ID      uuid.UUID
	UserID  uuid.UUID
	Type    Type
	Payload Payload
	// ReadAt is when the athlete saw it, or zero while they have not.
	ReadAt    time.Time
	CreatedAt time.Time
}

// Read reports whether the athlete has seen the notification.
func (n *Notification) Read() bool {
	return !n.ReadAt.IsZero()
}
