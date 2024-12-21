package parser

import (
	"fmt"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/crlssn/getstronger/server/gen/orm"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/safe"
)

type ExerciseOpt func(*apiv1.Exercise)

func Exercise(exercise *orm.Exercise, opts ...ExerciseOpt) *apiv1.Exercise {
	e := &apiv1.Exercise{
		Id:     exercise.ID,
		UserId: exercise.UserID,
		Name:   exercise.Title,
		Label:  exercise.SubTitle.String,
	}

	if exercise.R != nil {
		return e
	}

	for _, opt := range opts {
		opt(e)
	}

	return e
}

func ExerciseSlice(exercises orm.ExerciseSlice) []*apiv1.Exercise {
	return slice(exercises, Exercise)
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
		FirstName: user.FirstName,
		LastName:  user.LastName,
		Followed:  false,
		// Relationships. Load them with UserOpt.
		Email: "",
	}

	if user.R != nil {
		return u
	}

	for _, opt := range opts {
		opt(u)
	}

	return u
}

func UserSlice(users orm.UserSlice) []*apiv1.User {
	return slice(users, User)
}

type RoutineOpt func(*apiv1.Routine)

func RoutineExercises(exercises orm.ExerciseSlice) RoutineOpt {
	return func(routine *apiv1.Routine) {
		exerciseSlice := make([]*apiv1.Exercise, 0, len(exercises))
		for _, exercise := range exercises {
			exerciseSlice = append(exerciseSlice, Exercise(exercise))
		}

		routine.Exercises = exerciseSlice
	}
}

func Routine(routine *orm.Routine, opts ...RoutineOpt) *apiv1.Routine {
	r := &apiv1.Routine{
		Id:   routine.ID,
		Name: routine.Title,
		// Relationships. Load them with RoutineOpt.
		Exercises: nil,
	}

	if routine.R == nil {
		return r
	}

	for _, opt := range opts {
		opt(r)
	}

	return r
}

func RoutineSlice(routines orm.RoutineSlice) []*apiv1.Routine {
	return slice(routines, Routine)
}

type WorkoutsRelOpt func(w orm.WorkoutSlice) ([]*apiv1.Workout, error)

func WorkoutSlice(workouts orm.WorkoutSlice, personalBests orm.SetSlice) ([]*apiv1.Workout, error) {
	workoutSlice := make([]*apiv1.Workout, 0, len(workouts))
	for _, workout := range workouts {
		w, err := Workout(workout)
		if err != nil {
			return nil, fmt.Errorf("failed to parse workout: %w", err)
		}

		if workout.R == nil {
			workoutSlice = append(workoutSlice, w)
			continue
		}

		var workoutOpts []WorkoutRelOpt
		if workout.R.User != nil {
			workoutOpts = append(workoutOpts, WorkoutUser(workout.R.GetUser()))
		}

		var exercises orm.ExerciseSlice
		for _, set := range workout.R.GetSets() {
			exercises = append(exercises, set.R.GetExercise())
		}

		if exercises != nil {
			workoutOpts = append(workoutOpts, WorkoutExerciseSets(workout.R.GetSets(), personalBests))
		}

		w, err = Workout(workout, workoutOpts...)
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
		w.Comments = workoutComments(comments, users)
		return nil
	}
}

func WorkoutExerciseSets(sets orm.SetSlice, personalBests orm.SetSlice) WorkoutRelOpt {
	return func(w *apiv1.Workout) error {
		exerciseSets, err := ExerciseSetsSlice(sets, ExerciseSetsPersonalBests(personalBests))
		if err != nil {
			return fmt.Errorf("failed to parse exercise sets: %w", err)
		}

		w.ExerciseSets = exerciseSets
		return nil
	}
}

func Workout(workout *orm.Workout, relOpts ...WorkoutRelOpt) (*apiv1.Workout, error) {
	w := &apiv1.Workout{
		Id:         workout.ID,
		Name:       workout.Name,
		StartedAt:  timestamppb.New(workout.StartedAt),
		FinishedAt: timestamppb.New(workout.FinishedAt),
		// Relationships. Load them with WorkoutRelOpt.
		User:         nil,
		Comments:     nil,
		ExerciseSets: nil,
	}

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

func WorkoutComment(comment *orm.WorkoutComment, user *orm.User) *apiv1.WorkoutComment {
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

func workoutComments(comments orm.WorkoutCommentSlice, users orm.UserSlice) []*apiv1.WorkoutComment {
	mapUsers := make(map[string]*orm.User, len(users))
	for _, user := range users {
		mapUsers[user.ID] = user
	}

	cSlice := make([]*apiv1.WorkoutComment, 0, len(comments))
	for _, comment := range comments {
		cSlice = append(cSlice, WorkoutComment(comment, mapUsers[comment.UserID]))
	}

	return cSlice
}

type ExerciseSetsSliceOpt func(*apiv1.ExerciseSets)

func ExerciseSetsPersonalBests(personalBests orm.SetSlice) ExerciseSetsSliceOpt {
	return func(s *apiv1.ExerciseSets) {
		mapPersonalBests := make(map[string]struct{}, len(personalBests))
		for _, set := range personalBests {
			mapPersonalBests[set.ID] = struct{}{}
		}

		for _, set := range s.GetSets() {
			_, yes := mapPersonalBests[set.GetId()]
			if set.GetMetadata() == nil {
				set.Metadata = &apiv1.MetadataSet{}
			}

			set.Metadata.PersonalBest = yes
		}
	}
}

func ExerciseSetsSlice(sets orm.SetSlice, opts ...ExerciseSetsSliceOpt) ([]*apiv1.ExerciseSets, error) {
	mapExerciseSets := make(map[*apiv1.Exercise][]*apiv1.Set)
	for _, set := range sets {
		s, err := Set(set)
		if err != nil {
			return nil, fmt.Errorf("failed to parse set: %w", err)
		}

		exercise := Exercise(set.R.GetExercise())
		mapExerciseSets[exercise] = append(mapExerciseSets[exercise], s)
	}

	exerciseSetsSlice := make([]*apiv1.ExerciseSets, 0, len(mapExerciseSets))
	for exercise, setSlice := range mapExerciseSets {
		exerciseSets := &apiv1.ExerciseSets{
			Exercise: exercise,
			Sets:     setSlice,
		}

		for _, opt := range opts {
			opt(exerciseSets)
		}

		exerciseSetsSlice = append(exerciseSetsSlice, exerciseSets)
	}

	return exerciseSetsSlice, nil
}

func ExerciseSetSlice(exercises orm.ExerciseSlice, sets orm.SetSlice) ([]*apiv1.ExerciseSet, error) {
	mapExercises := make(map[string]*orm.Exercise, len(exercises))
	for _, exercise := range exercises {
		mapExercises[exercise.ID] = exercise
	}

	exerciseSets := make([]*apiv1.ExerciseSet, 0, len(sets))
	for _, set := range sets {
		s, err := Set(set)
		if err != nil {
			return nil, fmt.Errorf("failed to parse set: %w", err)
		}

		exerciseSets = append(exerciseSets, &apiv1.ExerciseSet{
			Exercise: Exercise(mapExercises[set.ExerciseID]),
			Set:      s,
		})
	}

	return exerciseSets, nil
}

func NotificationSlice(notifications orm.NotificationSlice, payload map[string]repo.NotificationPayload, users orm.UserSlice, workouts orm.WorkoutSlice) []*apiv1.Notification {
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

		notification := Notification(n, mapUsers[p.ActorID], mapWorkouts[p.WorkoutID])
		if notification == nil {
			continue
		}

		nSlice = append(nSlice, notification)
	}
	return nSlice
}

func ExerciseSliceFromPB(exerciseSets []*apiv1.ExerciseSets) []repo.ExerciseSet {
	s := make([]repo.ExerciseSet, 0, len(exerciseSets))
	for _, exerciseSet := range exerciseSets {
		sets := make([]repo.Set, 0, len(exerciseSet.GetSets()))
		for _, set := range exerciseSet.GetSets() {
			sets = append(sets, repo.Set{
				Reps:   int(set.GetReps()),
				Weight: set.GetWeight(),
			})
		}

		s = append(s, repo.ExerciseSet{
			ExerciseID: exerciseSet.GetExercise().GetId(),
			Sets:       sets,
		})
	}

	return s
}

func Notification(n *orm.Notification, u *orm.User, w *orm.Workout) *apiv1.Notification {
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

func FeedItemSlice(workouts orm.WorkoutSlice, personalBests orm.SetSlice) ([]*apiv1.FeedItem, error) {
	items := make([]*apiv1.FeedItem, 0, len(workouts))

	workoutSlice, err := WorkoutSlice(workouts, personalBests)
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

func SetSlice(sets orm.SetSlice, mapPersonalBests map[string]struct{}) ([]*apiv1.Set, error) {
	sSlice := make([]*apiv1.Set, 0, len(sets))
	for _, set := range sets {
		_, yes := mapPersonalBests[set.ID]
		s, err := Set(set, SetPersonalBest(yes))
		if err != nil {
			return nil, fmt.Errorf("failed to parse set: %w", err)
		}
		sSlice = append(sSlice, s)
	}
	return sSlice, nil
}

type SetOpt func(*apiv1.Set)

func SetPersonalBest(personalBest bool) SetOpt {
	return func(set *apiv1.Set) {
		if set.GetMetadata() == nil {
			set.Metadata = &apiv1.MetadataSet{}
		}

		set.Metadata.PersonalBest = personalBest
	}
}

func Set(set *orm.Set, opts ...SetOpt) (*apiv1.Set, error) {
	reps, err := safe.IntToInt32(set.Reps)
	if err != nil {
		return nil, fmt.Errorf("failed to parse reps: %w", err)
	}

	s := &apiv1.Set{
		Id:     set.ID,
		Weight: set.Weight,
		Reps:   reps,
		Metadata: &apiv1.MetadataSet{
			WorkoutId:    set.WorkoutID,
			CreatedAt:    timestamppb.New(set.CreatedAt),
			PersonalBest: false,
		},
	}

	for _, opt := range opts {
		opt(s)
	}

	return s, nil
}

func slice[Input any, Output any, Opts any](input []Input, f func(Input, ...Opts) Output) []Output {
	output := make([]Output, len(input))
	for i, item := range input {
		output[i] = f(item)
	}
	return output
}
