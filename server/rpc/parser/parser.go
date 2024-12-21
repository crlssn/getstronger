package parser

import (
	"fmt"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/crlssn/getstronger/server/gen/orm"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/repo"
)

type ExerciseOpt func(*apiv1.Exercise)

func Exercise(exercise *orm.Exercise, opts ...ExerciseOpt) *apiv1.Exercise {
	if exercise == nil {
		return nil
	}

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
		if workout.R == nil {
			workoutSlice = append(workoutSlice, Workout(workout))
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

		workoutSlice = append(workoutSlice, Workout(workout, workoutOpts...))
	}

	return workoutSlice, nil
}

type WorkoutRelOpt func(*apiv1.Workout)

func WorkoutUser(user *orm.User) WorkoutRelOpt {
	return func(w *apiv1.Workout) {
		w.User = User(user)
	}
}

func WorkoutComments(comments orm.WorkoutCommentSlice) WorkoutRelOpt {
	return func(w *apiv1.Workout) {
		w.Comments = workoutComments(comments)
	}
}

func WorkoutExerciseSets(sets orm.SetSlice, personalBests orm.SetSlice) WorkoutRelOpt {
	return func(w *apiv1.Workout) {
		w.ExerciseSets = ExerciseSetsSlice(sets, ExerciseSetsPersonalBests(personalBests))
	}
}

func Workout(workout *orm.Workout, relOpts ...WorkoutRelOpt) *apiv1.Workout {
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
		return w
	}

	for _, relOpt := range relOpts {
		relOpt(w)
	}

	return w
}

func WorkoutComment(comment *orm.WorkoutComment) *apiv1.WorkoutComment {
	c := &apiv1.WorkoutComment{
		Id:        comment.ID,
		User:      nil,
		Comment:   comment.Comment,
		CreatedAt: timestamppb.New(comment.CreatedAt),
	}

	if comment.R == nil {
		return c
	}

	c.User = User(comment.R.GetUser())
	return c
}

func workoutComments(comments orm.WorkoutCommentSlice) []*apiv1.WorkoutComment {
	cSlice := make([]*apiv1.WorkoutComment, 0, len(comments))
	for _, comment := range comments {
		cSlice = append(cSlice, WorkoutComment(comment))
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

func ExerciseSetsSlice(sets orm.SetSlice, opts ...ExerciseSetsSliceOpt) []*apiv1.ExerciseSets {
	mapExerciseSetsSlice := make(map[string]*apiv1.ExerciseSets)
	for _, set := range sets {
		exercise := set.R.GetExercise()
		if _, ok := mapExerciseSetsSlice[exercise.ID]; !ok {
			mapExerciseSetsSlice[exercise.ID] = &apiv1.ExerciseSets{
				Exercise: Exercise(exercise),
				Sets:     []*apiv1.Set{Set(set)},
			}
			continue
		}

		mapExerciseSetsSlice[exercise.ID].Sets = append(mapExerciseSetsSlice[exercise.ID].Sets, Set(set))
	}

	exerciseSetsSlice := make([]*apiv1.ExerciseSets, 0, len(mapExerciseSetsSlice))
	for _, exerciseSets := range mapExerciseSetsSlice {
		for _, opt := range opts {
			opt(exerciseSets)
		}

		exerciseSetsSlice = append(exerciseSetsSlice, exerciseSets)
	}

	return exerciseSetsSlice
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

		nSlice = append(nSlice, Notification(n,
			NotificationActor(n.Type, mapActors[p.ActorID]),
			NotificationWorkout(n.Type, mapWorkouts[p.WorkoutID]),
		))
	}

	return nSlice, nil
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
					UserFollowed: &apiv1.Notification_UserFollowed{Actor: nil},
				}
			}
			n.GetType().(*apiv1.Notification_UserFollowed_).UserFollowed.Actor = User(actor) //nolint:forcetypeassert
		case orm.NotificationTypeWorkoutComment:
			if _, ok := n.GetType().(*apiv1.Notification_WorkoutComment_); !ok {
				n.Type = &apiv1.Notification_WorkoutComment_{
					WorkoutComment: &apiv1.Notification_WorkoutComment{Actor: nil},
				}
			}
			n.GetType().(*apiv1.Notification_WorkoutComment_).WorkoutComment.Actor = User(actor) //nolint:forcetypeassert
		}
	}
}

func NotificationWorkout(notificationType orm.NotificationType, workout *orm.Workout) NotificationOpt {
	return func(n *apiv1.Notification) {
		if workout == nil {
			return
		}

		switch notificationType {
		case orm.NotificationTypeWorkoutComment:
			if _, ok := n.GetType().(*apiv1.Notification_WorkoutComment_); !ok {
				n.Type = &apiv1.Notification_WorkoutComment_{
					WorkoutComment: &apiv1.Notification_WorkoutComment{Actor: nil},
				}
			}
			n.Type.(*apiv1.Notification_WorkoutComment_).WorkoutComment.Workout = Workout(workout) //nolint:forcetypeassert
		case orm.NotificationTypeFollow:
			// Do nothing.
		}
	}
}

func Notification(notification *orm.Notification, opts ...NotificationOpt) *apiv1.Notification {
	n := &apiv1.Notification{
		Id:             notification.ID,
		NotifiedAtUnix: notification.CreatedAt.Unix(),
		// Relationships. Load them with NotificationOpt.
		Type: nil,
	}

	for _, opt := range opts {
		opt(n)
	}

	return n
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
	setSlice := make([]*apiv1.Set, 0, len(sets))
	for _, set := range sets {
		setSlice = append(setSlice, Set(set))
	}
	return setSlice
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

func slice[Input any, Output any, Opts any](input []Input, f func(Input, ...Opts) Output) []Output {
	output := make([]Output, len(input))
	for i, item := range input {
		output[i] = f(item)
	}
	return output
}
