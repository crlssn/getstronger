package v1

import (
	"fmt"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/crlssn/getstronger/server/pkg/orm"
	apiv1 "github.com/crlssn/getstronger/server/pkg/proto/api/v1"
	"github.com/crlssn/getstronger/server/pkg/repo"
	"github.com/crlssn/getstronger/server/pkg/safe"
)

func parseExerciseSliceToPB(exercises orm.ExerciseSlice) []*apiv1.Exercise {
	pbExercises := make([]*apiv1.Exercise, 0, len(exercises))
	for _, exercise := range exercises {
		pbExercises = append(pbExercises, parseExerciseToPB(exercise))
	}

	return pbExercises
}

func parseExerciseToPB(exercise *orm.Exercise) *apiv1.Exercise {
	return &apiv1.Exercise{
		Id:     exercise.ID,
		UserId: exercise.UserID,
		Name:   exercise.Title,
		Label:  exercise.SubTitle.String,
	}
}

func parseRoutineSliceToPB(routines orm.RoutineSlice) []*apiv1.Routine {
	pbRoutines := make([]*apiv1.Routine, 0, len(routines))
	for _, routine := range routines {
		pbRoutines = append(pbRoutines, parseRoutineToPB(routine))
	}

	return pbRoutines
}

func parseRoutineToPB(routine *orm.Routine) *apiv1.Routine {
	var exercises []*apiv1.Exercise
	if routine.R != nil && routine.R.Exercises != nil {
		exercises = parseExerciseSliceToPB(routine.R.Exercises)
	}

	return &apiv1.Routine{
		Id:        routine.ID,
		Name:      routine.Title,
		Exercises: exercises,
	}
}

func parseWorkoutSliceToPB(workoutSlice orm.WorkoutSlice, exerciseSlice orm.ExerciseSlice, userSlice orm.UserSlice) ([]*apiv1.Workout, error) {
	workouts := make([]*apiv1.Workout, 0, len(workoutSlice))
	for _, workout := range workoutSlice {
		w, err := parseWorkoutToPB(workout, exerciseSlice, userSlice)
		if err != nil {
			return nil, fmt.Errorf("failed to parse workout: %w", err)
		}

		workouts = append(workouts, w)
	}

	return workouts, nil
}

func parseWorkoutToPB(workout *orm.Workout, exercises orm.ExerciseSlice, commentUsers orm.UserSlice) (*apiv1.Workout, error) {
	var exerciseOrder []string
	mapExerciseSets := make(map[string][]*apiv1.Set)

	if workout.R != nil {
		for _, set := range workout.R.Sets {
			if _, ok := mapExerciseSets[set.ExerciseID]; !ok {
				exerciseOrder = append(exerciseOrder, set.ExerciseID)
			}

			reps, err := safe.IntToInt32(set.Reps)
			if err != nil {
				return nil, fmt.Errorf("failed to parse reps: %w", err)
			}

			mapExerciseSets[set.ExerciseID] = append(mapExerciseSets[set.ExerciseID], &apiv1.Set{
				Weight: set.Weight,
				Reps:   reps,
			})
		}
	}

	mapExercises := make(map[string]*apiv1.Exercise, len(exercises))
	for _, exercise := range exercises {
		mapExercises[exercise.ID] = parseExerciseToPB(exercise)
	}

	exerciseSets := make([]*apiv1.ExerciseSets, 0, len(exerciseOrder))
	for _, exerciseID := range exerciseOrder {
		exerciseSets = append(exerciseSets, &apiv1.ExerciseSets{
			Exercise: mapExercises[exerciseID],
			Sets:     mapExerciseSets[exerciseID],
		})
	}

	return &apiv1.Workout{
		Id:           workout.ID,
		Name:         workout.Name,
		User:         parseUserToPB(workout.R.User, false),
		ExerciseSets: exerciseSets,
		Comments:     parseWorkoutCommentSliceToPB(workout.R.WorkoutComments, commentUsers),
		StartedAt:    timestamppb.New(workout.CreatedAt),
		FinishedAt:   timestamppb.New(workout.FinishedAt),
	}, nil
}

func parseWorkoutCommentSliceToPB(commentSlice orm.WorkoutCommentSlice, users orm.UserSlice) []*apiv1.WorkoutComment {
	mapUsers := make(map[string]*orm.User, len(users))
	for _, user := range users {
		mapUsers[user.ID] = user
	}

	comments := make([]*apiv1.WorkoutComment, 0, len(commentSlice))
	for _, comment := range commentSlice {
		comments = append(comments, parseWorkoutCommentToPB(comment, mapUsers[comment.UserID]))
	}

	return comments
}

func parseWorkoutCommentToPB(comment *orm.WorkoutComment, user *orm.User) *apiv1.WorkoutComment {
	return &apiv1.WorkoutComment{
		Id:        comment.ID,
		User:      parseUserToPB(user, false),
		Comment:   comment.Comment,
		CreatedAt: timestamppb.New(comment.CreatedAt),
	}
}

func parseUserToPB(user *orm.User, followed bool) *apiv1.User {
	var email string
	if user.R != nil && user.R.Auth != nil {
		email = user.R.Auth.Email
	}

	return &apiv1.User{
		Id:        user.ID,
		Email:     email,
		FirstName: user.FirstName,
		LastName:  user.LastName,
		Followed:  followed,
	}
}

func parseExerciseSetsFromPB(exerciseSetSlice []*apiv1.ExerciseSets) []repo.ExerciseSet {
	exerciseSets := make([]repo.ExerciseSet, 0, len(exerciseSetSlice))
	for _, exerciseSet := range exerciseSetSlice {
		sets := make([]repo.Set, 0, len(exerciseSet.GetSets()))
		for _, set := range exerciseSet.GetSets() {
			sets = append(sets, repo.Set{
				Reps:   int(set.GetReps()),
				Weight: set.GetWeight(),
			})
		}

		exerciseSets = append(exerciseSets, repo.ExerciseSet{
			ExerciseID: exerciseSet.GetExercise().GetId(),
			Sets:       sets,
		})
	}

	return exerciseSets
}

var errExerciseNotFound = fmt.Errorf("exercise not found")

func parseSetSliceToExerciseSetsPB(setSlice orm.SetSlice, exerciseSlice orm.ExerciseSlice) ([]*apiv1.ExerciseSets, error) {
	mapExercises := make(map[string]*apiv1.Exercise, len(exerciseSlice))
	for _, exercise := range exerciseSlice {
		mapExercises[exercise.ID] = parseExerciseToPB(exercise)
	}

	mapExerciseSets := make(map[*apiv1.Exercise][]*apiv1.Set)
	for _, set := range setSlice {
		exerciseKey, ok := mapExercises[set.ExerciseID]
		if !ok {
			return nil, fmt.Errorf("%w: %s", errExerciseNotFound, set.ExerciseID)
		}

		if _, ok = mapExerciseSets[exerciseKey]; !ok {
			mapExerciseSets[exerciseKey] = make([]*apiv1.Set, 0)
		}

		reps, err := safe.IntToInt32(set.Reps)
		if err != nil {
			return nil, fmt.Errorf("failed to parse reps: %w", err)
		}

		mapExerciseSets[exerciseKey] = append(mapExerciseSets[exerciseKey], &apiv1.Set{
			Weight: float64(set.Weight),
			Reps:   reps,
		})
	}

	exerciseSets := make([]*apiv1.ExerciseSets, 0, len(mapExerciseSets))
	for exerciseID, sets := range mapExerciseSets {
		exerciseSets = append(exerciseSets, &apiv1.ExerciseSets{
			Exercise: exerciseID,
			Sets:     sets,
		})
	}

	return exerciseSets, nil
}

func parsePersonalBestSliceToPB(personalBests orm.SetSlice, exercises orm.ExerciseSlice) ([]*apiv1.PersonalBest, error) {
	mapExercises := make(map[string]*orm.Exercise, len(exercises))
	for _, exercise := range exercises {
		mapExercises[exercise.ID] = exercise
	}

	pbs := make([]*apiv1.PersonalBest, 0, len(personalBests))
	for _, pb := range personalBests {
		reps, err := safe.IntToInt32(pb.Reps)
		if err != nil {
			return nil, fmt.Errorf("failed to parse reps: %w", err)
		}

		pbs = append(pbs, &apiv1.PersonalBest{
			Exercise: parseExerciseToPB(mapExercises[pb.ExerciseID]),
			Set: &apiv1.Set{
				Weight: pb.Weight,
				Reps:   reps,
				Metadata: &apiv1.MetadataSet{
					WorkoutId: pb.WorkoutID,
					CreatedAt: timestamppb.New(pb.CreatedAt),
				},
			},
		})
	}

	return pbs, nil
}

func parseUserSliceToPB(users orm.UserSlice) []*apiv1.User {
	pbUsers := make([]*apiv1.User, 0, len(users))
	for _, u := range users {
		pbUsers = append(pbUsers, &apiv1.User{
			Id:        u.ID,
			FirstName: u.FirstName,
			LastName:  u.LastName,
		})
	}

	return pbUsers
}

func parseNotificationSliceToPB(
	notifications orm.NotificationSlice,
	payload map[string]repo.NotificationPayload,
	users orm.UserSlice,
	workouts orm.WorkoutSlice,
) []*apiv1.Notification {
	mapWorkouts := make(map[string]*orm.Workout)
	for _, w := range workouts {
		mapWorkouts[w.ID] = w
	}

	mapUsers := make(map[string]*orm.User)
	for _, u := range users {
		mapUsers[u.ID] = u
	}

	var slice []*apiv1.Notification //nolint:prealloc
	for _, n := range notifications {
		p, ok := payload[n.ID]
		if !ok {
			continue
		}

		a, ok := mapUsers[p.ActorID]
		if !ok {
			continue
		}

		w, ok := mapWorkouts[p.WorkoutID]
		if !ok {
			continue
		}

		slice = append(slice, parseNotificationToPB(n, a, w))
	}

	return slice
}

func parseNotificationToPB(n *orm.Notification, u *orm.User, w *orm.Workout) *apiv1.Notification {
	switch n.Type {
	case orm.NotificationTypeFollow:
		return &apiv1.Notification{
			Id:             n.ID,
			NotifiedAtUnix: n.CreatedAt.Unix(),
			Type: &apiv1.Notification_UserFollowed_{
				UserFollowed: &apiv1.Notification_UserFollowed{
					Actor: parseUserToPB(u, false),
				},
			},
		}
	case orm.NotificationTypeWorkoutComment:
		return &apiv1.Notification{
			Id:             n.ID,
			NotifiedAtUnix: n.CreatedAt.Unix(),
			Type: &apiv1.Notification_WorkoutComment_{
				WorkoutComment: &apiv1.Notification_WorkoutComment{
					Actor: parseUserToPB(u, false),
					Workout: &apiv1.Workout{
						Id:   w.ID,
						Name: w.Name,
						User: parseUserToPB(w.R.User, false),
					},
				},
			},
		}
	default:
		return nil
	}
}

func parseFeedItemsToPB(workouts orm.WorkoutSlice, exercises orm.ExerciseSlice) ([]*apiv1.FeedItem, error) {
	items := make([]*apiv1.FeedItem, 0, len(workouts))
	for _, workout := range workouts {
		w, err := parseWorkoutToPB(workout, exercises, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to parse workout: %w", err)
		}

		items = append(items, &apiv1.FeedItem{
			Type: &apiv1.FeedItem_Workout{
				Workout: w,
			},
		})
	}
	return items, nil
}

func parseSetSliceToPB(setSlice orm.SetSlice) ([]*apiv1.Set, error) {
	sets := make([]*apiv1.Set, 0, len(setSlice))
	for _, set := range setSlice {
		s, err := parseSetToPB(set)
		if err != nil {
			return nil, fmt.Errorf("failed to parse set: %w", err)
		}
		sets = append(sets, s)
	}
	return sets, nil
}

func parseSetToPB(set *orm.Set) (*apiv1.Set, error) {
	reps, err := safe.IntToInt32(set.Reps)
	if err != nil {
		return nil, fmt.Errorf("failed to parse reps: %w", err)
	}

	return &apiv1.Set{
		Weight: set.Weight,
		Reps:   reps,
		Metadata: &apiv1.MetadataSet{
			WorkoutId: set.WorkoutID,
			CreatedAt: timestamppb.New(set.CreatedAt),
		},
	}, nil
}
