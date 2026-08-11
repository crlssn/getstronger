package parser

import (
	"encoding/json"
	"fmt"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/safe"
)

func Exercise(exercise *models.Exercise) *apiv1.Exercise {
	return &apiv1.Exercise{
		Id:          exercise.ID.String(),
		UserId:      exercise.UserID.String(),
		Name:        exercise.Title,
		Tags:        []string(exercise.Tags),
		Metrics:     exerciseMetricsFromDB(exercise.Metrics),
		RestSeconds: exercise.RestSeconds,
	}
}

func exerciseMetricsFromDB(metrics []string) []apiv1.ExerciseMetric {
	parsed := make([]apiv1.ExerciseMetric, 0, len(metrics))
	for _, metric := range metrics {
		switch metric {
		case "weight":
			parsed = append(parsed, apiv1.ExerciseMetric_EXERCISE_METRIC_WEIGHT)
		case "reps":
			parsed = append(parsed, apiv1.ExerciseMetric_EXERCISE_METRIC_REPS)
		case "distance":
			parsed = append(parsed, apiv1.ExerciseMetric_EXERCISE_METRIC_DISTANCE)
		case "time":
			parsed = append(parsed, apiv1.ExerciseMetric_EXERCISE_METRIC_TIME)
		}
	}
	return parsed
}

func ExerciseSlice(exercises models.ExerciseSlice) []*apiv1.Exercise {
	return parseWithoutOpts(exercises, Exercise)
}

type UserOpt func(*apiv1.User)

func UserFollowed(followed bool) UserOpt {
	return func(user *apiv1.User) {
		user.Followed = followed
	}
}

func User(user *models.User, opts ...UserOpt) *apiv1.User {
	u := &apiv1.User{
		Id:        user.ID.String(),
		FirstName: user.FirstName,
		LastName:  user.LastName,
		Followed:  false,
		Email:     "",
	}

	if user.R.Auth != nil {
		u.Email = user.R.Auth.Email
	}

	for _, opt := range opts {
		opt(u)
	}

	return u
}

func UserSlice(users models.UserSlice) []*apiv1.User {
	return parseWithEmptyOpts(users, User)
}

func Routine(routine *models.Routine) *apiv1.Routine {
	r := &apiv1.Routine{
		Id:        routine.ID.String(),
		Name:      routine.Title,
		Exercises: nil,
	}

	if routine.R.Exercises != nil {
		r.Exercises = parseWithoutOpts(routine.R.Exercises, Exercise)
	}

	return r
}

func RoutineSlice(routines models.RoutineSlice) []*apiv1.Routine {
	return parseWithoutOpts(routines, Routine)
}

func Plan(plan *repo.TrainingPlan) *apiv1.Plan {
	if plan == nil {
		return nil
	}

	return &apiv1.Plan{
		Id:              plan.ID,
		Name:            plan.Name,
		Routines:        RoutineSlice(plan.Routines),
		CurrentPosition: safe.Int32FromInt(plan.CurrentPosition),
		Active:          plan.Active,
	}
}

func PlanSlice(plans []*repo.TrainingPlan) []*apiv1.Plan {
	parsed := make([]*apiv1.Plan, 0, len(plans))
	for _, plan := range plans {
		parsed = append(parsed, Plan(plan))
	}
	return parsed
}

type WorkoutOpt func(*apiv1.Workout)

func WorkoutExerciseSets(sets models.SetSlice, personalBests models.SetSlice) WorkoutOpt {
	return func(w *apiv1.Workout) {
		w.ExerciseSets = ExerciseSetsSlice(sets, ExerciseSetsPersonalBests(personalBests))
	}
}

func WorkoutIntensity(sets models.SetSlice) WorkoutOpt {
	return func(w *apiv1.Workout) {
		var intensity float64
		for _, set := range sets {
			intensity += set.Weight * float64(set.Reps)
		}

		w.Intensity = safe.Int32FromFloat64(intensity)
	}
}

func Workout(workout *models.Workout, opts ...WorkoutOpt) *apiv1.Workout {
	routineID := ""
	if !workout.RoutineID.IsNull() {
		routineID = workout.RoutineID.GetOrZero().String()
	}

	w := &apiv1.Workout{
		Id:           workout.ID.String(),
		Name:         workout.Name,
		StartedAt:    timestamppb.New(workout.StartedAt),
		FinishedAt:   timestamppb.New(workout.FinishedAt),
		User:         nil,
		Comments:     nil,
		ExerciseSets: nil,
		Intensity:    0,
		Note:         workout.Note.GetOrZero(),
		RoutineId:    routineID,
	}

	if workout.R.User != nil {
		w.User = User(workout.R.User)
	}

	for _, comment := range workout.R.WorkoutComments {
		w.Comments = append(w.Comments, WorkoutComment(comment))
	}

	for _, opt := range opts {
		opt(w)
	}

	return w
}

func WorkoutSlice(workouts models.WorkoutSlice, personalBests models.SetSlice) ([]*apiv1.Workout, error) {
	workoutSlice := make([]*apiv1.Workout, 0, len(workouts))
	for _, workout := range workouts {
		var workoutOpts []WorkoutOpt
		if workout.R.Sets != nil {
			workoutOpts = append(
				workoutOpts,
				WorkoutIntensity(workout.R.Sets),
				WorkoutExerciseSets(workout.R.Sets, personalBests),
			)
		}

		workoutSlice = append(workoutSlice, Workout(workout, workoutOpts...))
	}

	return workoutSlice, nil
}

func WorkoutComment(comment *models.WorkoutComment) *apiv1.WorkoutComment {
	c := &apiv1.WorkoutComment{
		Id:        comment.ID.String(),
		Comment:   comment.Comment,
		CreatedAt: timestamppb.New(comment.CreatedAt),
		User:      nil,
	}

	if comment.R.User != nil {
		c.User = User(comment.R.User)
	}

	return c
}

type ExerciseSetsSliceOpt func(*apiv1.ExerciseSets)

func ExerciseSetsPersonalBests(personalBests models.SetSlice) ExerciseSetsSliceOpt {
	return func(s *apiv1.ExerciseSets) {
		mapPersonalBests := make(map[string]struct{}, len(personalBests))
		for _, set := range personalBests {
			mapPersonalBests[set.ID.String()] = struct{}{}
		}

		for _, set := range s.GetSets() {
			if set.GetMetadata() == nil {
				set.Metadata = &apiv1.MetadataSet{}
			}

			_, yes := mapPersonalBests[set.GetId()]
			set.Metadata.PersonalBest = yes
		}
	}
}

func ExerciseSetsSlice(sets models.SetSlice, opts ...ExerciseSetsSliceOpt) []*apiv1.ExerciseSets {
	exerciseOrder := make([]string, 0, len(sets))
	mapExerciseSets := make(map[string]*apiv1.ExerciseSets)
	for _, set := range sets {
		exercise := set.R.Exercise
		exerciseID := exercise.ID.String()
		if _, ok := mapExerciseSets[exerciseID]; !ok {
			exerciseOrder = append(exerciseOrder, exerciseID)
			mapExerciseSets[exerciseID] = &apiv1.ExerciseSets{
				Exercise: Exercise(exercise),
				Sets:     []*apiv1.Set{Set(set, nil)},
			}

			continue
		}

		mapExerciseSets[exerciseID].Sets = append(mapExerciseSets[exerciseID].Sets, Set(set, nil))
	}

	sliceExerciseSets := make([]*apiv1.ExerciseSets, 0, len(mapExerciseSets))
	for _, exerciseID := range exerciseOrder {
		exerciseSet := mapExerciseSets[exerciseID]
		for _, opt := range opts {
			opt(exerciseSet)
		}

		sliceExerciseSets = append(sliceExerciseSets, exerciseSet)
	}

	return sliceExerciseSets
}

func ExerciseSetSlice(sets models.SetSlice) []*apiv1.ExerciseSet {
	exerciseSets := make([]*apiv1.ExerciseSet, 0, len(sets))
	for _, set := range sets {
		exerciseSets = append(exerciseSets, &apiv1.ExerciseSet{
			Exercise: Exercise(set.R.Exercise),
			Set:      Set(set, nil),
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
				ID:              set.GetId(),
				Reps:            int(set.GetReps()),
				Weight:          set.GetWeight(),
				Distance:        set.GetDistance(),
				DurationSeconds: int(set.GetDurationSeconds()),
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

func NotificationActor(nType repo.NotificationType, actor *models.User) NotificationOpt {
	return func(n *apiv1.Notification) {
		if actor == nil {
			return
		}

		switch nType {
		case repo.NotificationTypeFollow:
			if _, ok := n.GetType().(*apiv1.Notification_UserFollowed_); !ok {
				n.Type = &apiv1.Notification_UserFollowed_{
					UserFollowed: &apiv1.Notification_UserFollowed{
						Actor: nil,
					},
				}
			}

			n.GetType().(*apiv1.Notification_UserFollowed_).UserFollowed.Actor = User(actor) //nolint:forcetypeassert
		case repo.NotificationTypeWorkoutComment:
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

func NotificationWorkout(nType repo.NotificationType, workout *models.Workout) NotificationOpt {
	return func(n *apiv1.Notification) {
		if nType != repo.NotificationTypeWorkoutComment || workout == nil {
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

func Notification(notification *models.Notification, opts ...NotificationOpt) *apiv1.Notification {
	n := &apiv1.Notification{
		Id:             notification.ID.String(),
		NotifiedAtUnix: notification.CreatedAt.Unix(),
		Read:           !notification.ReadAt.IsNull(),
		Type:           nil,
	}

	for _, opt := range opts {
		opt(n)
	}

	return n
}

func NotificationSlice(notifications models.NotificationSlice, actors models.UserSlice, workouts models.WorkoutSlice) ([]*apiv1.Notification, error) {
	mapActors := make(map[string]*models.User)
	for _, a := range actors {
		mapActors[a.ID.String()] = a
	}

	mapWorkouts := make(map[string]*models.Workout)
	for _, w := range workouts {
		mapWorkouts[w.ID.String()] = w
	}

	nSlice := make([]*apiv1.Notification, 0, len(notifications))
	for _, n := range notifications {
		var p repo.NotificationPayload
		if err := json.Unmarshal(n.Payload.Val, &p); err != nil {
			return nil, fmt.Errorf("failed to unmarshal notification payload: %w", err)
		}

		actor, actorExists := mapActors[p.ActorID]
		workout, workoutExists := mapWorkouts[p.WorkoutID]

		switch n.Type {
		case repo.NotificationTypeFollow:
			if actorExists {
				nSlice = append(nSlice, Notification(
					n,
					NotificationActor(n.Type, actor),
				))
			}
		case repo.NotificationTypeWorkoutComment:
			if actorExists && workoutExists {
				nSlice = append(nSlice, Notification(
					n,
					NotificationActor(n.Type, actor),
					NotificationWorkout(n.Type, workout),
				))
			}
		}
	}

	return nSlice, nil
}

func FeedItemSlice(workouts models.WorkoutSlice, personalBests models.SetSlice) ([]*apiv1.FeedItem, error) {
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

func SetSlice(sets models.SetSlice, personalBests models.SetSlice) []*apiv1.Set {
	mapPersonalBests := make(map[string]struct{}, len(personalBests))
	for _, set := range personalBests {
		mapPersonalBests[set.ID.String()] = struct{}{}
	}

	slice := make([]*apiv1.Set, 0, len(sets))
	for _, set := range sets {
		slice = append(slice, Set(set, mapPersonalBests))
	}

	return slice
}

func Set(set *models.Set, mapPersonalBests map[string]struct{}) *apiv1.Set {
	return &apiv1.Set{
		Id:              set.ID.String(),
		Weight:          set.Weight,
		Reps:            set.Reps,
		Distance:        set.Distance,
		DurationSeconds: set.DurationSeconds,
		Metadata: &apiv1.MetadataSet{
			WorkoutId: set.WorkoutID.String(),
			CreatedAt: timestamppb.New(set.CreatedAt),
			PersonalBest: func() bool {
				_, yes := mapPersonalBests[set.ID.String()]
				return yes
			}(),
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
