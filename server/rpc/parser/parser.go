package parser

import (
	"fmt"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/crlssn/getstronger/server/gen/orm"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/repo"
)

func Exercise(exercise *orm.Exercise) *apiv1.Exercise {
	return &apiv1.Exercise{
		Id:     exercise.ID,
		UserId: exercise.UserID,
		Name:   exercise.Title,
		Label:  exercise.SubTitle.String,
	}
}

func ExerciseSlice(exercises orm.ExerciseSlice) []*apiv1.Exercise {
	return parseWithoutOpts(exercises, Exercise)
}

type UserOpt func(*apiv1.User)

func UserFollowed(followed bool) UserOpt {
	return func(user *apiv1.User) {
		user.Followed = followed
	}
}

func User(user *orm.User, opts ...UserOpt) *apiv1.User {
	u := &apiv1.User{
		Id:        user.ID,
		FirstName: user.FirstName,
		LastName:  user.LastName,
		Followed:  false,
		Email:     "",
	}

	if user.R != nil {
		if user.R.Auth != nil {
			u.Email = user.R.GetAuth().Email
		}
	}

	for _, opt := range opts {
		opt(u)
	}

	return u
}

func UserSlice(users orm.UserSlice) []*apiv1.User {
	return parseWithEmptyOpts(users, User)
}

func Routine(routine *orm.Routine) *apiv1.Routine {
	r := &apiv1.Routine{
		Id:        routine.ID,
		Name:      routine.Title,
		Exercises: nil,
	}

	if routine.R != nil {
		if routine.R.Exercises != nil {
			r.Exercises = parseWithoutOpts(routine.R.GetExercises(), Exercise)
		}
	}

	return r
}

func RoutineSlice(routines orm.RoutineSlice) []*apiv1.Routine {
	return parseWithoutOpts(routines, Routine)
}

type WorkoutOpt func(*apiv1.Workout)

func WorkoutExerciseSets(sets orm.SetSlice, personalBests orm.SetSlice) WorkoutOpt {
	return func(w *apiv1.Workout) {
		w.ExerciseSets = ExerciseSetsSlice(sets, ExerciseSetsPersonalBests(personalBests))
	}
}

func Workout(workout *orm.Workout, opts ...WorkoutOpt) *apiv1.Workout {
	w := &apiv1.Workout{
		Id:           workout.ID,
		Name:         workout.Name,
		StartedAt:    timestamppb.New(workout.StartedAt),
		FinishedAt:   timestamppb.New(workout.FinishedAt),
		User:         nil,
		Comments:     nil,
		ExerciseSets: nil,
	}

	if workout.R != nil {
		if workout.R.User != nil {
			w.User = User(workout.R.GetUser())
		}

		for _, comment := range workout.R.GetWorkoutComments() {
			w.Comments = append(w.Comments, WorkoutComment(comment))
		}
	}

	for _, opt := range opts {
		opt(w)
	}

	return w
}

func WorkoutSlice(workouts orm.WorkoutSlice, personalBests orm.SetSlice) ([]*apiv1.Workout, error) {
	workoutSlice := make([]*apiv1.Workout, 0, len(workouts))
	for _, workout := range workouts {
		if workout.R == nil {
			workoutSlice = append(workoutSlice, Workout(workout))
			continue
		}

		var workoutOpts []WorkoutOpt
		if workout.R.GetSets() != nil {
			workoutOpts = append(workoutOpts, WorkoutExerciseSets(workout.R.GetSets(), personalBests))
		}

		workoutSlice = append(workoutSlice, Workout(workout, workoutOpts...))
	}

	return workoutSlice, nil
}

func WorkoutComment(comment *orm.WorkoutComment) *apiv1.WorkoutComment {
	c := &apiv1.WorkoutComment{
		Id:        comment.ID,
		Comment:   comment.Comment,
		CreatedAt: timestamppb.New(comment.CreatedAt),
		User:      nil,
	}

	if comment.R == nil {
		return c
	}

	if comment.R.User != nil {
		c.User = User(comment.R.GetUser())
	}

	return c
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

func ExerciseSetsSlice(sets orm.SetSlice, opts ...ExerciseSetsSliceOpt) []*apiv1.ExerciseSets {
	mapExerciseSets := make(map[string]*apiv1.ExerciseSets)
	for _, set := range sets {
		exercise := set.R.GetExercise()
		if _, ok := mapExerciseSets[exercise.ID]; !ok {
			mapExerciseSets[exercise.ID] = &apiv1.ExerciseSets{
				Exercise: Exercise(exercise),
				Sets:     []*apiv1.Set{Set(set)},
			}

			continue
		}

		mapExerciseSets[exercise.ID].Sets = append(mapExerciseSets[exercise.ID].Sets, Set(set))
	}

	sliceExerciseSets := make([]*apiv1.ExerciseSets, 0, len(mapExerciseSets))
	for _, exerciseSets := range mapExerciseSets {
		for _, opt := range opts {
			opt(exerciseSets)
		}

		sliceExerciseSets = append(sliceExerciseSets, exerciseSets)
	}

	return sliceExerciseSets
}

func ExerciseSetSlice(sets orm.SetSlice) []*apiv1.ExerciseSet {
	exerciseSets := make([]*apiv1.ExerciseSet, 0, len(sets))
	for _, set := range sets {
		exerciseSets = append(exerciseSets, &apiv1.ExerciseSet{
			Exercise: Exercise(set.R.GetExercise()),
			Set:      Set(set),
		})
	}

	return exerciseSets
}

func ExerciseSetsFromPB(exerciseSets []*apiv1.ExerciseSets) []repo.ExerciseSet {
	exerciseSetSlice := make([]repo.ExerciseSet, 0, len(exerciseSets))
	for _, exerciseSet := range exerciseSets {
		sets := make([]repo.Set, 0, len(exerciseSet.GetSets()))
		for _, set := range exerciseSet.GetSets() {
			sets = append(sets, repo.Set{
				ID:     set.GetId(),
				Reps:   int(set.GetReps()),
				Weight: set.GetWeight(),
			})
		}

		exerciseSetSlice = append(exerciseSetSlice, repo.ExerciseSet{
			ExerciseID: exerciseSet.GetExercise().GetId(),
			Sets:       sets,
		})
	}

	return exerciseSetSlice
}

type NotificationOpt func(*apiv1.Notification)

func NotificationActor(nType orm.NotificationType, actor *orm.User) NotificationOpt {
	return func(n *apiv1.Notification) {
		if actor == nil {
			return
		}

		switch nType {
		case orm.NotificationTypeFollow:
			if _, ok := n.GetType().(*apiv1.Notification_UserFollowed_); !ok {
				n.Type = &apiv1.Notification_UserFollowed_{
					UserFollowed: &apiv1.Notification_UserFollowed{
						Actor: nil,
					},
				}
			}

			n.GetType().(*apiv1.Notification_UserFollowed_).UserFollowed.Actor = User(actor) //nolint:forcetypeassert
		case orm.NotificationTypeWorkoutComment:
			if _, ok := n.GetType().(*apiv1.Notification_WorkoutComment_); !ok {
				n.Type = &apiv1.Notification_WorkoutComment_{
					WorkoutComment: &apiv1.Notification_WorkoutComment{
						Actor:   nil,
						Workout: nil,
					},
				}
			}

			n.GetType().(*apiv1.Notification_WorkoutComment_).WorkoutComment.Actor = User(actor) //nolint:forcetypeassert
		}
	}
}

func NotificationWorkout(nType orm.NotificationType, workout *orm.Workout) NotificationOpt {
	return func(n *apiv1.Notification) {
		if nType != orm.NotificationTypeWorkoutComment || workout == nil {
			return
		}

		if _, ok := n.GetType().(*apiv1.Notification_WorkoutComment_); !ok {
			n.Type = &apiv1.Notification_WorkoutComment_{
				WorkoutComment: &apiv1.Notification_WorkoutComment{
					Actor:   nil,
					Workout: nil,
				},
			}
		}

		n.Type.(*apiv1.Notification_WorkoutComment_).WorkoutComment.Workout = Workout(workout) //nolint:forcetypeassert
	}
}

func Notification(notification *orm.Notification, opts ...NotificationOpt) *apiv1.Notification {
	n := &apiv1.Notification{
		Id:             notification.ID,
		NotifiedAtUnix: notification.CreatedAt.Unix(),
		Type:           nil,
	}

	for _, opt := range opts {
		opt(n)
	}

	return n
}

func NotificationSlice(notifications orm.NotificationSlice, actors orm.UserSlice, workouts orm.WorkoutSlice) ([]*apiv1.Notification, error) {
	mapActors := make(map[string]*orm.User)
	for _, a := range actors {
		mapActors[a.ID] = a
	}

	mapWorkouts := make(map[string]*orm.Workout)
	for _, w := range workouts {
		mapWorkouts[w.ID] = w
	}

	nSlice := make([]*apiv1.Notification, 0, len(notifications))
	for _, n := range notifications {
		var p repo.NotificationPayload
		if err := n.Payload.Unmarshal(&p); err != nil {
			return nil, fmt.Errorf("failed to unmarshal notification payload: %w", err)
		}

		actor, actorExists := mapActors[p.ActorID]
		workout, workoutExists := mapWorkouts[p.WorkoutID]

		switch n.Type {
		case orm.NotificationTypeFollow:
			if actorExists {
				nSlice = append(nSlice, Notification(n,
					NotificationActor(n.Type, actor),
				))
			}
		case orm.NotificationTypeWorkoutComment:
			if actorExists && workoutExists {
				nSlice = append(nSlice, Notification(n,
					NotificationActor(n.Type, actor),
					NotificationWorkout(n.Type, workout),
				))
			}
		}
	}

	return nSlice, nil
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

func SetSlice(sets orm.SetSlice) []*apiv1.Set {
	return parseWithoutOpts(sets, Set)
}

func Set(set *orm.Set) *apiv1.Set {
	return &apiv1.Set{
		Id:     set.ID,
		Weight: set.Weight,
		Reps:   int32(set.Reps), //nolint:gosec
		Metadata: &apiv1.MetadataSet{
			WorkoutId:    set.WorkoutID,
			CreatedAt:    timestamppb.New(set.CreatedAt),
			PersonalBest: false,
		},
	}
}

func parseWithoutOpts[Input any, Output any](input []Input, f func(Input) Output) []Output {
	output := make([]Output, len(input))
	for i, item := range input {
		output[i] = f(item)
	}
	return output
}

func parseWithEmptyOpts[Input any, Output any, Opts any](input []Input, f func(Input, ...Opts) Output) []Output {
	output := make([]Output, len(input))
	for i, item := range input {
		output[i] = f(item)
	}
	return output
}
