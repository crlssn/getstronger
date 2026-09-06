package repo

import (
	"encoding/json"
	"fmt"

	"github.com/crlssn/getstronger/server/account"
	"github.com/crlssn/getstronger/server/distanceunit"
	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/notification"
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/weightunit"
)

// The generated row types stay inside this package. What leaves it is the
// vocabulary of the bounded context each row belongs to, so a column that
// moves does not move every handler with it. A relation the read did not load
// stays nil on the entity, which is how callers tell "not asked for" from
// "none".

func authFromRow(row *models.Auth) *account.Auth {
	auth := &account.Auth{
		ID:                           row.ID,
		Email:                        row.Email,
		EmailVerified:                row.EmailVerified,
		EmailToken:                   row.EmailToken,
		RefreshToken:                 row.RefreshToken.GetOrZero(),
		PasswordResetTokenValidUntil: row.PasswordResetTokenValidUntil.GetOrZero(),
		EmailVerificationSentAt:      row.EmailVerificationSentAt.GetOrZero(),
		CreatedAt:                    row.CreatedAt,
	}
	if row.R.User != nil {
		auth.User = userFromRow(row.R.User)
	}

	return auth
}

func userFromRow(row *models.User) *account.User {
	user := &account.User{
		ID:           row.ID,
		AuthID:       row.AuthID,
		Name:         row.Name,
		Username:     row.Username,
		WeightUnit:   weightunit.Normalize(row.WeightUnit),
		DistanceUnit: distanceunit.Normalize(row.DistanceUnit),
		AutofillSets: row.AutofillSets,
		CreatedAt:    row.CreatedAt,
		FeedSeenAt:   row.FeedSeenAt.GetOrZero(),
	}
	if row.R.Auth != nil {
		user.Email = row.R.Auth.Email
	}

	return user
}

func usersFromRows(rows models.UserSlice) []*account.User {
	return fromRows(rows, userFromRow)
}

func exerciseFromRow(row *models.Exercise) *training.Exercise {
	return &training.Exercise{
		ID:        row.ID,
		UserID:    row.UserID,
		Name:      row.Title,
		Tags:      []string(row.Tags),
		Metrics:   training.MetricsFromStrings(row.Metrics),
		CreatedAt: row.CreatedAt,
		DeletedAt: row.DeletedAt.GetOrZero(),
	}
}

func exercisesFromRows(rows models.ExerciseSlice) []*training.Exercise {
	return fromRows(rows, exerciseFromRow)
}

func routineFromRow(row *models.Routine) *training.Routine {
	routine := &training.Routine{
		ID:        row.ID,
		UserID:    row.UserID,
		Name:      row.Title,
		CreatedAt: row.CreatedAt,
		DeletedAt: row.DeletedAt.GetOrZero(),
	}
	if row.R.Exercises != nil {
		routine.Exercises = exercisesFromRows(row.R.Exercises)
	}

	return routine
}

func routinesFromRows(rows models.RoutineSlice) []*training.Routine {
	return fromRows(rows, routineFromRow)
}

func workoutFromRow(row *models.Workout) *training.Workout {
	workout := &training.Workout{
		ID:            row.ID,
		UserID:        row.UserID,
		RoutineID:     row.RoutineID.GetOrZero(),
		RecordingJSON: row.RecordingJSON,
		Name:          row.Name,
		Note:          row.Note.GetOrZero(),
		StartedAt:     row.StartedAt,
		FinishedAt:    row.FinishedAt,
		CreatedAt:     row.CreatedAt,
	}
	if row.R.User != nil {
		workout.User = userFromRow(row.R.User)
	}
	if row.R.WorkoutComments != nil {
		// Bob points each loaded comment back at this workout; following that
		// link would convert the workout again, and its comments, without end.
		workout.Comments = fromRows(row.R.WorkoutComments, workoutCommentWithoutWorkout)
	}
	if row.R.Sets != nil {
		workout.Sets = setsFromRows(row.R.Sets)
	}

	return workout
}

func workoutsFromRows(rows models.WorkoutSlice) []*training.Workout {
	return fromRows(rows, workoutFromRow)
}

func setFromRow(row *models.Set) *training.Set {
	set := &training.Set{
		ID:              row.ID,
		WorkoutID:       row.WorkoutID,
		ExerciseID:      row.ExerciseID,
		UserID:          row.UserID,
		Weight:          row.Weight,
		Reps:            row.Reps,
		Distance:        row.Distance,
		DurationSeconds: row.DurationSeconds,
		WeightUnit:      weightunit.Normalize(row.WeightUnit),
		DistanceUnit:    distanceunit.Normalize(row.DistanceUnit),
		Position:        row.Position,
		OccurrenceID:    row.WorkoutGroupExerciseID.GetOrZero(),
		CreatedAt:       row.CreatedAt,
	}
	if row.R.Exercise != nil {
		set.Exercise = exerciseFromRow(row.R.Exercise)
	}

	return set
}

func setsFromRows(rows models.SetSlice) []*training.Set {
	return fromRows(rows, setFromRow)
}

func workoutCommentFromRow(row *models.WorkoutComment) *training.WorkoutComment {
	comment := workoutCommentWithoutWorkout(row)
	if row.R.Workout != nil {
		comment.Workout = workoutFromRow(row.R.Workout)
	}

	return comment
}

// workoutCommentWithoutWorkout converts a comment reached through its workout,
// which already is the workout and must not be converted again.
func workoutCommentWithoutWorkout(row *models.WorkoutComment) *training.WorkoutComment {
	comment := &training.WorkoutComment{
		ID:        row.ID,
		UserID:    row.UserID,
		WorkoutID: row.WorkoutID,
		Comment:   row.Comment,
		CreatedAt: row.CreatedAt,
	}
	if row.R.User != nil {
		comment.User = userFromRow(row.R.User)
	}

	return comment
}

// notificationFromRow decodes the stored payload as it goes: a notification
// whose payload cannot be read is one nothing can be rendered from.
func notificationFromRow(row *models.Notification) (*notification.Notification, error) {
	var payload notification.Payload
	if err := json.Unmarshal(row.Payload.Val, &payload); err != nil {
		return nil, fmt.Errorf("notification payload unmarshal: %w", err)
	}

	return &notification.Notification{
		ID:        row.ID,
		UserID:    row.UserID,
		Type:      row.Type,
		Payload:   payload,
		ReadAt:    row.ReadAt.GetOrZero(),
		CreatedAt: row.CreatedAt,
	}, nil
}

func notificationsFromRows(rows models.NotificationSlice) ([]*notification.Notification, error) {
	notifications := make([]*notification.Notification, 0, len(rows))
	for _, row := range rows {
		n, err := notificationFromRow(row)
		if err != nil {
			return nil, err
		}
		notifications = append(notifications, n)
	}

	return notifications, nil
}

func fromRows[Row any, Entity any](rows []Row, convert func(Row) Entity) []Entity {
	entities := make([]Entity, 0, len(rows))
	for _, row := range rows {
		entities = append(entities, convert(row))
	}

	return entities
}
