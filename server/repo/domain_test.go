package repo

import (
	"testing"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/models"
)

// Bob links a loaded comment back to the workout it was loaded through. The
// conversion must stop at that link rather than convert the workout, and its
// comments, and the workout, without end.
func TestWorkoutFromRowStopsAtACommentsBackReference(t *testing.T) {
	t.Parallel()

	workout := &models.Workout{ID: uuid.Must(uuid.NewV4())}
	comment := &models.WorkoutComment{ID: uuid.Must(uuid.NewV4()), WorkoutID: workout.ID}
	comment.R.Workout = workout
	workout.R.WorkoutComments = models.WorkoutCommentSlice{comment}

	converted := workoutFromRow(workout)
	require.Len(t, converted.Comments, 1)
	require.Equal(t, comment.ID, converted.Comments[0].ID)
	require.Nil(t, converted.Comments[0].Workout)

	// Read the other way round, the comment still carries its workout, and
	// the workout its comments.
	fromComment := workoutCommentFromRow(comment)
	require.Equal(t, workout.ID, fromComment.Workout.ID)
	require.Len(t, fromComment.Workout.Comments, 1)
	require.Nil(t, fromComment.Workout.Comments[0].Workout)
}
