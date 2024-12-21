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
	return slice(exercises, ExerciseToPB)
}

type UserOpt func(*apiv1.User)

func UserFollowed(followed bool) UserOpt {
	return func(user *apiv1.User) {
		user.Followed = followed
	}
}

func UserEmail(auth *orm.Auth) UserOpt {
	return func(user *apiv1.User) {
		user.Email = auth.Email
	}
}

func User(user *orm.User, opts ...UserOpt) *apiv1.User {
	u := &apiv1.User{
		Id:        user.ID,
		Email:     safeGetEmail(user),
		FirstName: user.FirstName,
		LastName:  user.LastName,
	}

	for _, opt := range opts {
		opt(u)
	}

	return u
}

func UsersToPB(users orm.UserSlice) []*apiv1.User {
	return slice(users, func(user *orm.User) *apiv1.User {
		return User(user)
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
	return slice(routines, RoutineToPB)
}

type WorkoutsRelOpt func(w orm.WorkoutSlice) ([]*apiv1.Workout, error)

func Workouts(workouts orm.WorkoutSlice, personalBests orm.SetSlice) ([]*apiv1.Workout, error) {
	workoutSlice := make([]*apiv1.Workout, 0, len(workouts))
	for _, workout := range workouts {
		if workout.R == nil {
			w, err := Workout(workout)
			if err != nil {
				return nil, fmt.Errorf("failed to parse workout: %w", err)
			}

			workoutSlice = append(workoutSlice, w)
			continue
		}

		var workoutOpts []WorkoutRelOpt
		if workout.R.User != nil {
			workoutOpts = append(workoutOpts, WorkoutUser(workout.R.User))
		}

		var exercises orm.ExerciseSlice
		for _, set := range workout.R.GetSets() {
			exercises = append(exercises, set.R.GetExercise())
		}

		if exercises != nil {
			workoutOpts = append(workoutOpts, WorkoutExerciseSets(exercises, workout.R.GetSets(), personalBests))
		}

		w, err := Workout(workout, workoutOpts...)
		if err != nil {
			return nil, fmt.Errorf("failed to parse workout: %w", err)
		}

		workoutSlice = append(workoutSlice, w)
	}

	return workoutSlice, nil
}

type WorkoutRelOpt func(*apiv1.Workout) error

func WorkoutUser(user *orm.User) WorkoutRelOpt {
	return func(w *apiv1.Workout) error {
		w.User = User(user)
		return nil
	}
}

func WorkoutComments(comments orm.WorkoutCommentSlice, users orm.UserSlice) WorkoutRelOpt {
	return func(w *apiv1.Workout) error {
		w.Comments = workoutCommentsToPB(comments, users)
		return nil
	}
}

func WorkoutExerciseSets(exercises orm.ExerciseSlice, sets orm.SetSlice, personalBests orm.SetSlice) WorkoutRelOpt {
	return func(w *apiv1.Workout) error {
		exerciseSets, err := ExerciseSetSlicesToPB(exercises, sets, personalBests)
		if err != nil {
			return fmt.Errorf("failed to parse exercise sets: %w", err)
		}

		w.ExerciseSets = exerciseSets
		return nil
	}
}

func Workout(workout *orm.Workout, relOpts ...WorkoutRelOpt) (*apiv1.Workout, error) {
	w := workoutToPB(workout)
	if workout.R == nil {
		return w, nil
	}

	for _, relOpt := range relOpts {
		if err := relOpt(w); err != nil {
			return nil, fmt.Errorf("failed to apply workout rel opt: %w", err)
		}
	}

	return w, nil
}

func workoutToPB(workout *orm.Workout) *apiv1.Workout {
	return &apiv1.Workout{
		Id:         workout.ID,
		Name:       workout.Name,
		StartedAt:  timestamppb.New(workout.StartedAt),
		FinishedAt: timestamppb.New(workout.FinishedAt),

		// Relationships. Load them with WorkoutRelOpt.
		User:         nil,
		Comments:     nil,
		ExerciseSets: nil,
	}
}

func WorkoutCommentToPB(comment *orm.WorkoutComment, user *orm.User) *apiv1.WorkoutComment {
	if comment == nil {
		return nil
	}

	return &apiv1.WorkoutComment{
		Id:        comment.ID,
		User:      User(user),
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

func ExerciseSetSlicesToPB(exercises orm.ExerciseSlice, sets orm.SetSlice, personalBests orm.SetSlice) ([]*apiv1.ExerciseSets, error) {
	mapExercises := make(map[string]*apiv1.Exercise, len(exercises))
	for _, exercise := range exercises {
		mapExercises[exercise.ID] = ExerciseToPB(exercise)
	}

	mapPersonalBests := make(map[string]struct{}, len(personalBests))
	for _, personalBest := range personalBests {
		mapPersonalBests[personalBest.ID] = struct{}{}
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

		s, err := setToPB(set, mapPersonalBests)
		if err != nil {
			return nil, fmt.Errorf("failed to parse set: %w", err)
		}

		mapExerciseSets[exerciseKey] = append(mapExerciseSets[exerciseKey], s)
	}

	exerciseSets := make([]*apiv1.ExerciseSets, 0, len(mapExerciseSets))
	for exerciseID, setSlice := range mapExerciseSets {
		exerciseSets = append(exerciseSets, &apiv1.ExerciseSets{
			Exercise: exerciseID,
			Sets:     setSlice,
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
					Actor: User(u),
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
					Actor: User(u),
					Workout: &apiv1.Workout{
						Id:   w.ID,
						Name: w.Name,
						User: User(w.R.GetUser()),
					},
				},
			},
		}
	default:
		return nil
	}
}

func FeedItems(workouts orm.WorkoutSlice, personalBests orm.SetSlice) ([]*apiv1.FeedItem, error) {
	items := make([]*apiv1.FeedItem, 0, len(workouts))

	workoutSlice, err := Workouts(workouts, personalBests)
	if err != nil {
		return nil, fmt.Errorf("failed to parse workouts: %w", err)
	}

	for _, workout := range workoutSlice {
		items = append(items, &apiv1.FeedItem{
			Type: &apiv1.FeedItem_Workout{
				Workout: workout,
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

func setToPB(set *orm.Set, mapPersonalBests map[string]struct{}) (*apiv1.Set, error) {
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
				_, yes := mapPersonalBests[set.ID]
				return yes
			}(),
		},
	}, nil
}

func slice[Input any, Output any](input []Input, f func(Input) Output) []Output {
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
