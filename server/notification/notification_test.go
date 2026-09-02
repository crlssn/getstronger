package notification_test

import (
	"encoding/json"
	"testing"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/notification"
)

func TestCommentAudience(t *testing.T) {
	t.Parallel()

	owner := uuid.Must(uuid.NewV4())
	commenter := uuid.Must(uuid.NewV4())
	other := uuid.Must(uuid.NewV4())

	comment := func(userID uuid.UUID) *models.WorkoutComment {
		return &models.WorkoutComment{UserID: userID}
	}

	t.Run("tells the owner and everyone already in the conversation", func(t *testing.T) {
		t.Parallel()
		audience := notification.CommentAudience(commenter, owner, models.WorkoutCommentSlice{
			comment(other), comment(commenter), comment(other),
		})
		require.ElementsMatch(t, []uuid.UUID{owner, other}, audience)
	})

	t.Run("never tells the commenter about their own comment", func(t *testing.T) {
		t.Parallel()
		audience := notification.CommentAudience(commenter, commenter, models.WorkoutCommentSlice{
			comment(commenter),
		})
		require.Empty(t, audience)
	})

	t.Run("is ordered so one comment always notifies the same way", func(t *testing.T) {
		t.Parallel()
		comments := models.WorkoutCommentSlice{comment(other), comment(owner)}
		first := notification.CommentAudience(commenter, owner, comments)
		for range 10 {
			require.Equal(t, first, notification.CommentAudience(commenter, owner, comments))
		}
	})
}

// The store's unique index on (user_id, eventId) covers every row that carries
// the key, so a payload naming no event must not write one: the nil UUID would
// read as an event every notification of a user shares.
func TestPayloadStoresOnlyTheIDsItNames(t *testing.T) {
	t.Parallel()

	actor := uuid.Must(uuid.NewV4())

	stored, err := json.Marshal(notification.Payload{ActorID: actor})
	require.NoError(t, err)
	require.JSONEq(t, `{"actorId":"`+actor.String()+`"}`, string(stored))

	var read notification.Payload
	require.NoError(t, json.Unmarshal(stored, &read))
	require.Equal(t, actor, read.ActorID)
	require.True(t, read.EventID.IsNil())
	require.True(t, read.WorkoutID.IsNil())
}

// A payload written before the ids were typed still reads back.
func TestPayloadReadsWhatIsStored(t *testing.T) {
	t.Parallel()

	actor, event, workout := uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4())

	var read notification.Payload
	require.NoError(t, json.Unmarshal([]byte(
		`{"actorId":"`+actor.String()+`","eventId":"`+event.String()+`","workoutId":"`+workout.String()+`"}`,
	), &read))

	require.Equal(t, actor, read.ActorID)
	require.Equal(t, event, read.EventID)
	require.Equal(t, workout, read.WorkoutID)
}
