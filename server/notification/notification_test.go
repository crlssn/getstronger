package notification_test

import (
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
