package parser

import (
	"fmt"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/crlssn/getstronger/server/gen/orm"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/safe"
)

func ExerciseToPB(exercise *orm.Exercise) *apiv1.Exercise {
	if exercise == nil {
		return nil
	}

	return &apiv1.Exercise{
		Id:     exercise.ID,
		UserId: exercise.UserID,
		Name:   exercise.Title,
		Label:  exercise.SubTitle.String,
	}
}

func ExercisesToPB(exercises orm.ExerciseSlice) []*apiv1.Exercise {
	return toSlice(exercises, ExerciseToPB)
}

func UserToPB(user *orm.User, followed bool) *apiv1.User {
	if user == nil {
		return nil
	}

	return &apiv1.User{
		Id:        user.ID,
		Email:     safeGetEmail(user),
		FirstName: user.FirstName,
		LastName:  user.LastName,
		Followed:  followed,
	}
}

func UsersToPB(users orm.UserSlice) []*apiv1.User {
	return toSlice(users, func(user *orm.User) *apiv1.User {
		return UserToPB(user, false)
	})
}

func RoutineToPB(routine *orm.Routine) *apiv1.Routine {
	if routine == nil {
		return nil
	}

	var exercises []*apiv1.Exercise
	if routine.R != nil {
		exercises = ExercisesToPB(routine.R.Exercises)
	}

	return &apiv1.Routine{
		Id:        routine.ID,
		Name:      routine.Title,
		Exercises: exercises,
	}
}

func RoutinesToPB(routines orm.RoutineSlice) []*apiv1.Routine {
	return toSlice(routines, RoutineToPB)
}

type WorkoutToPBOpt func(w *apiv1.Workout) error

func Workout(workout *orm.Workout, exercises orm.ExerciseSlice, sets orm.SetSlice) WorkoutToPBOpt {
	return func(w *apiv1.Workout) error {
		if workout == nil {
			return fmt.Errorf("workout is nil")
		}

		w.Name = workout.Name
		w.User = UserToPB(workout.R.User, false)
		w.StartedAt = timestamppb.New(workout.StartedAt)
		w.FinishedAt = timestamppb.New(workout.FinishedAt)

		if workout.R == nil {
			return nil
		}

		mapExercises := make(map[string]*apiv1.Exercise, len(exercises))
		exerciseOrder := make([]string, 0, len(workout.R.Sets))
		mapExerciseSets := make(map[string][]*apiv1.Set)

		for _, exercise := range exercises {
			mapExercises[exercise.ID] = ExerciseToPB(exercise)
		}

		mapPersonalBests := make(map[string]*orm.Set, len(sets))
		for _, set := range sets {
			mapPersonalBests[set.ID] = set
		}

		for _, set := range workout.R.Sets {
			if _, exists := mapExerciseSets[set.ExerciseID]; !exists {
				exerciseOrder = append(exerciseOrder, set.ExerciseID)
			}

			s, err := setToPB(set, mapPersonalBests)
			if err != nil {
				return fmt.Errorf("failed to parse set: %w", err)
			}

			mapExerciseSets[set.ExerciseID] = append(mapExerciseSets[set.ExerciseID], s)
		}

		for _, exerciseID := range exerciseOrder {
			exercise, ok := mapExercises[exerciseID]
			if !ok {
				continue
			}

			w.ExerciseSets = append(w.ExerciseSets, &apiv1.ExerciseSets{
				Exercise: exercise,
				Sets:     mapExerciseSets[exerciseID],
			})
		}

		return nil
	}
}

func WorkoutToPBOpts(opts ...WorkoutToPBOpt) (*apiv1.Workout, error) {
	workout := new(apiv1.Workout)
	for _, opt := range opts {
		if err := opt(workout); err != nil {
			return nil, fmt.Errorf("failed to apply option: %w", err)
		}
	}

	return workout, nil
}

func WorkoutToPB(workout *orm.Workout, exercises orm.ExerciseSlice, users orm.UserSlice, mapPersonalBests map[string]struct{}) (*apiv1.Workout, error) {
	var exerciseOrder []string
	mapExerciseSets := make(map[string][]*apiv1.Set)

	if workout.R != nil {
		for _, set := range workout.R.Sets {
			if _, ok := mapExerciseSets[set.ExerciseID]; !ok {
				exerciseOrder = append(exerciseOrder, set.ExerciseID)
			}

			s, err := setToPB(set, mapPersonalBests)
			if err != nil {
				return nil, fmt.Errorf("failed to parse set: %w", err)
			}

			mapExerciseSets[set.ExerciseID] = append(mapExerciseSets[set.ExerciseID], s)
		}
	}

	mapExercises := make(map[string]*apiv1.Exercise, len(exercises))
	for _, exercise := range exercises {
		mapExercises[exercise.ID] = ExerciseToPB(exercise)
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
		User:         UserToPB(workout.R.User, false),
		ExerciseSets: exerciseSets,
		Comments:     workoutCommentsToPB(workout.R.WorkoutComments, users),
		StartedAt:    timestamppb.New(workout.StartedAt),
		FinishedAt:   timestamppb.New(workout.FinishedAt),
	}, nil
}

func WorkoutsToPB(workouts orm.WorkoutSlice, exercises orm.ExerciseSlice, users orm.UserSlice, mapPersonalBests map[string]struct{}) ([]*apiv1.Workout, error) {
	wSlice := make([]*apiv1.Workout, 0, len(workouts))
	for _, workout := range workouts {
		w, err := WorkoutToPB(workout, exercises, users, mapPersonalBests)
		if err != nil {
			return nil, fmt.Errorf("failed to parse workout: %w", err)
		}

		wSlice = append(wSlice, w)
	}

	return wSlice, nil
}

func WorkoutCommentToPB(comment *orm.WorkoutComment, user *orm.User) *apiv1.WorkoutComment {
	if comment == nil {
		return nil
	}

	return &apiv1.WorkoutComment{
		Id:        comment.ID,
		User:      UserToPB(user, false),
		Comment:   comment.Comment,
		CreatedAt: timestamppb.New(comment.CreatedAt),
	}
}

func workoutCommentsToPB(comments orm.WorkoutCommentSlice, users orm.UserSlice) []*apiv1.WorkoutComment {
	mapUsers := make(map[string]*orm.User, len(users))
	for _, user := range users {
		mapUsers[user.ID] = user
	}

	cSlice := make([]*apiv1.WorkoutComment, 0, len(comments))
	for _, comment := range comments {
		cSlice = append(cSlice, WorkoutCommentToPB(comment, mapUsers[comment.UserID]))
	}

	return cSlice
}

func ExerciseSetSlicesToPB(exercises orm.ExerciseSlice, sets orm.SetSlice) ([]*apiv1.ExerciseSets, error) {
	mapExercises := make(map[string]*apiv1.Exercise, len(exercises))
	for _, exercise := range exercises {
		mapExercises[exercise.ID] = ExerciseToPB(exercise)
	}

	mapExerciseSets := make(map[*apiv1.Exercise][]*apiv1.Set)
	for _, set := range sets {
		exerciseKey, ok := mapExercises[set.ExerciseID]
		if !ok {
			return nil, fmt.Errorf("%w: %s", errExerciseNotFound, set.ExerciseID)
		}

		if _, ok = mapExerciseSets[exerciseKey]; !ok {
			mapExerciseSets[exerciseKey] = make([]*apiv1.Set, 0)
		}

		s, err := setToPB(set, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to parse set: %w", err)
		}

		mapExerciseSets[exerciseKey] = append(mapExerciseSets[exerciseKey], s)
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

func ExerciseSetSliceToPB(exercises orm.ExerciseSlice, sets orm.SetSlice) ([]*apiv1.ExerciseSet, error) {
	mapExercises := make(map[string]*orm.Exercise, len(exercises))
	for _, exercise := range exercises {
		mapExercises[exercise.ID] = exercise
	}

	exerciseSets := make([]*apiv1.ExerciseSet, 0, len(sets))
	for _, pb := range sets {
		set, err := setToPB(pb, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to parse set: %w", err)
		}

		exerciseSets = append(exerciseSets, &apiv1.ExerciseSet{
			Exercise: ExerciseToPB(mapExercises[pb.ExerciseID]),
			Set:      set,
		})
	}
	return exerciseSets, nil
}

func NotificationsToPB(notifications orm.NotificationSlice, payload map[string]repo.NotificationPayload, users orm.UserSlice, workouts orm.WorkoutSlice) []*apiv1.Notification {
	mapWorkouts := make(map[string]*orm.Workout)
	for _, w := range workouts {
		mapWorkouts[w.ID] = w
	}

	mapUsers := make(map[string]*orm.User)
	for _, u := range users {
		mapUsers[u.ID] = u
	}

	nSlice := make([]*apiv1.Notification, 0, len(notifications))
	for _, n := range notifications {
		p, ok := payload[n.ID]
		if !ok {
			continue
		}

		notification := notificationToPB(n, mapUsers[p.ActorID], mapWorkouts[p.WorkoutID])
		if notification == nil {
			continue
		}

		nSlice = append(nSlice, notification)
	}
	return nSlice
}

func ExercisesFromPB(exerciseSets []*apiv1.ExerciseSets) []repo.ExerciseSet {
	slice := make([]repo.ExerciseSet, 0, len(exerciseSets))
	for _, exerciseSet := range exerciseSets {
		sets := make([]repo.Set, 0, len(exerciseSet.GetSets()))
		for _, set := range exerciseSet.GetSets() {
			sets = append(sets, repo.Set{
				Reps:   int(set.GetReps()),
				Weight: set.GetWeight(),
			})
		}

		slice = append(slice, repo.ExerciseSet{
			ExerciseID: exerciseSet.GetExercise().GetId(),
			Sets:       sets,
		})
	}

	return slice
}

func notificationToPB(n *orm.Notification, u *orm.User, w *orm.Workout) *apiv1.Notification {
	switch n.Type {
	case orm.NotificationTypeFollow:
		return &apiv1.Notification{
			Id:             n.ID,
			NotifiedAtUnix: n.CreatedAt.Unix(),
			Type: &apiv1.Notification_UserFollowed_{
				UserFollowed: &apiv1.Notification_UserFollowed{
					Actor: UserToPB(u, false),
				},
			},
		}
	case orm.NotificationTypeWorkoutComment:
		if w == nil {
			return nil
		}
		return &apiv1.Notification{
			Id:             n.ID,
			NotifiedAtUnix: n.CreatedAt.Unix(),
			Type: &apiv1.Notification_WorkoutComment_{
				WorkoutComment: &apiv1.Notification_WorkoutComment{
					Actor: UserToPB(u, false),
					Workout: &apiv1.Workout{
						Id:   w.ID,
						Name: w.Name,
						User: UserToPB(w.R.User, false),
					},
				},
			},
		}
	default:
		return nil
	}
}

func FeedItemsToPB(workouts orm.WorkoutSlice, exercises orm.ExerciseSlice, mapPersonalBests map[string]struct{}) ([]*apiv1.FeedItem, error) {
	items := make([]*apiv1.FeedItem, 0, len(workouts))
	for _, workout := range workouts {
		parsedWorkout, err := WorkoutToPB(workout, exercises, nil, mapPersonalBests)
		if err != nil {
			return nil, fmt.Errorf("failed to parse workout: %w", err)
		}

		items = append(items, &apiv1.FeedItem{
			Type: &apiv1.FeedItem_Workout{
				Workout: parsedWorkout,
			},
		})
	}
	return items, nil
}

func SetsToPB(sets orm.SetSlice, mapPersonalBests map[string]struct{}) ([]*apiv1.Set, error) {
	sSlice := make([]*apiv1.Set, 0, len(sets))
	for _, set := range sets {
		s, err := setToPB(set, mapPersonalBests)
		if err != nil {
			return nil, fmt.Errorf("failed to parse set: %w", err)
		}
		sSlice = append(sSlice, s)
	}
	return sSlice, nil
}

func setToPB(set *orm.Set, mapPersonalBests map[string]*orm.Set) (*apiv1.Set, error) {
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
			PersonalBest: func() bool {
				_, personalBest := mapPersonalBests[set.ID]
				return personalBest
			}(),
		},
	}, nil
}

func toSlice[Input any, Output any](input []Input, f func(Input) Output) []Output {
	output := make([]Output, len(input))
	for i, item := range input {
		output[i] = f(item)
	}
	return output
}

func safeGetEmail(user *orm.User) string {
	if user.R != nil && user.R.Auth != nil {
		return user.R.Auth.Email
	}
	return ""
}

var errExerciseNotFound = fmt.Errorf("exercise not found")
