package parser

import (
	"encoding/json"
	"fmt"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/crlssn/getstronger/server/distanceunit"
	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/notification"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/safe"
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/weightunit"
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
		if proto := exerciseMetricToProto(training.Metric(metric)); proto != apiv1.ExerciseMetric_EXERCISE_METRIC_UNSPECIFIED {
			parsed = append(parsed, proto)
		}
	}
	return parsed
}

func exerciseMetricToProto(metric training.Metric) apiv1.ExerciseMetric {
	switch metric {
	case training.MetricWeight:
		return apiv1.ExerciseMetric_EXERCISE_METRIC_WEIGHT
	case training.MetricReps:
		return apiv1.ExerciseMetric_EXERCISE_METRIC_REPS
	case training.MetricDistance:
		return apiv1.ExerciseMetric_EXERCISE_METRIC_DISTANCE
	case training.MetricTime:
		return apiv1.ExerciseMetric_EXERCISE_METRIC_TIME
	default:
		return apiv1.ExerciseMetric_EXERCISE_METRIC_UNSPECIFIED
	}
}

// ExerciseMetricsFromProto states a request in the training vocabulary. A
// measurement this API does not know becomes an invalid metric, which the
// training context is left to reject.
func ExerciseMetricsFromProto(metrics []apiv1.ExerciseMetric) []training.Metric {
	parsed := make([]training.Metric, 0, len(metrics))
	for _, metric := range metrics {
		switch metric {
		case apiv1.ExerciseMetric_EXERCISE_METRIC_WEIGHT:
			parsed = append(parsed, training.MetricWeight)
		case apiv1.ExerciseMetric_EXERCISE_METRIC_REPS:
			parsed = append(parsed, training.MetricReps)
		case apiv1.ExerciseMetric_EXERCISE_METRIC_DISTANCE:
			parsed = append(parsed, training.MetricDistance)
		case apiv1.ExerciseMetric_EXERCISE_METRIC_TIME:
			parsed = append(parsed, training.MetricTime)
		case apiv1.ExerciseMetric_EXERCISE_METRIC_UNSPECIFIED:
			parsed = append(parsed, training.Metric(""))
		default:
			parsed = append(parsed, training.Metric(""))
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
		Id:           user.ID.String(),
		Name:         user.Name,
		Username:     user.Username,
		Followed:     false,
		Email:        "",
		WeightUnit:   WeightUnitToProto(user.WeightUnit),
		DistanceUnit: DistanceUnitToProto(user.DistanceUnit),
		AutofillSets: user.AutofillSets,
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

// RoutineWithGroups adds the routine's groups to the flat exercise list, for
// the screens that need to know how the session is worked through.
func RoutineWithGroups(routine *models.Routine, groups []*training.RoutineGroup) *apiv1.Routine {
	r := Routine(routine)
	r.Groups = RoutineGroupSlice(groups)

	return r
}

func RoutineGroupSlice(groups []*training.RoutineGroup) []*apiv1.RoutineGroup {
	parsed := make([]*apiv1.RoutineGroup, 0, len(groups))
	for _, group := range groups {
		parsed = append(parsed, &apiv1.RoutineGroup{
			Id:                          group.ID,
			Mode:                        RoutineGroupModeToProto(group.Mode),
			RestBetweenExercisesSeconds: group.RestBetweenExercisesSeconds,
			RestBetweenRoundsSeconds:    group.RestBetweenRoundsSeconds,
			Exercises:                   ExerciseSlice(group.Exercises),
		})
	}

	return parsed
}

func RoutineGroupModeToProto(mode training.RoutineGroupMode) apiv1.RoutineGroupMode {
	if mode == training.RoutineGroupModeCircuit {
		return apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT
	}

	return apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_STRAIGHT
}

func RoutineGroupModeFromProto(mode apiv1.RoutineGroupMode) training.RoutineGroupMode {
	if mode == apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT {
		return training.RoutineGroupModeCircuit
	}

	return training.RoutineGroupModeStraight
}

func Plan(plan *training.Plan) *apiv1.Plan {
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

func PlanSlice(plans []*training.Plan) []*apiv1.Plan {
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

// WorkoutIntensity reports the workout's tonnage; the API calls it intensity.
func WorkoutIntensity(sets models.SetSlice) WorkoutOpt {
	return func(w *apiv1.Workout) {
		w.Intensity = safe.Int32FromFloat64(training.TotalVolume(sets).Float64())
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

func WorkoutSlice(workouts models.WorkoutSlice, personalBests models.SetSlice) []*apiv1.Workout {
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

	return workoutSlice
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
				WeightUnit:      WeightUnitFromProto(set.GetWeightUnit()),
				Distance:        set.GetDistance(),
				DistanceUnit:    DistanceUnitFromProto(set.GetDistanceUnit()),
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

func NotificationActor(nType notification.Type, actor *models.User) NotificationOpt {
	return func(n *apiv1.Notification) {
		if actor == nil {
			return
		}

		switch nType {
		case notification.TypeFollow:
			if _, ok := n.GetType().(*apiv1.Notification_UserFollowed_); !ok {
				n.Type = &apiv1.Notification_UserFollowed_{
					UserFollowed: &apiv1.Notification_UserFollowed{
						Actor: nil,
					},
				}
			}

			n.GetType().(*apiv1.Notification_UserFollowed_).UserFollowed.Actor = User(actor) //nolint:forcetypeassert
		case notification.TypeWorkoutComment:
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

func NotificationWorkout(nType notification.Type, workout *models.Workout) NotificationOpt {
	return func(n *apiv1.Notification) {
		if nType != notification.TypeWorkoutComment || workout == nil {
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
		var p notification.Payload
		if err := json.Unmarshal(n.Payload.Val, &p); err != nil {
			return nil, fmt.Errorf("unmarshal notification payload: %w", err)
		}

		actor, actorExists := mapActors[p.ActorID]
		workout, workoutExists := mapWorkouts[p.WorkoutID]

		switch n.Type {
		case notification.TypeFollow:
			if actorExists {
				nSlice = append(nSlice, Notification(
					n,
					NotificationActor(n.Type, actor),
				))
			}
		case notification.TypeWorkoutComment:
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

func FeedItemSlice(workouts models.WorkoutSlice, personalBests models.SetSlice) []*apiv1.FeedItem {
	items := make([]*apiv1.FeedItem, 0, len(workouts))
	for _, workout := range WorkoutSlice(workouts, personalBests) {
		items = append(items, &apiv1.FeedItem{
			Type: &apiv1.FeedItem_Workout{
				Workout: workout,
			},
		})
	}

	return items
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
		Weight:          weightunit.FromKilograms(set.Weight, set.WeightUnit),
		WeightUnit:      WeightUnitToProto(set.WeightUnit),
		Reps:            set.Reps,
		Distance:        distanceunit.FromKilometers(set.Distance, set.DistanceUnit),
		DistanceUnit:    DistanceUnitToProto(set.DistanceUnit),
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

func WeightUnitFromProto(unit apiv1.WeightUnit) string {
	if unit == apiv1.WeightUnit_WEIGHT_UNIT_POUNDS {
		return string(weightunit.Pounds)
	}

	return string(weightunit.Kilograms)
}

func WeightUnitToProto(unit string) apiv1.WeightUnit {
	if weightunit.Normalize(unit) == weightunit.Pounds {
		return apiv1.WeightUnit_WEIGHT_UNIT_POUNDS
	}

	return apiv1.WeightUnit_WEIGHT_UNIT_KILOGRAMS
}

func DistanceUnitFromProto(unit apiv1.DistanceUnit) string {
	if unit == apiv1.DistanceUnit_DISTANCE_UNIT_MILES {
		return string(distanceunit.Miles)
	}

	return string(distanceunit.Kilometers)
}

func DistanceUnitToProto(unit string) apiv1.DistanceUnit {
	if distanceunit.Normalize(unit) == distanceunit.Miles {
		return apiv1.DistanceUnit_DISTANCE_UNIT_MILES
	}

	return apiv1.DistanceUnit_DISTANCE_UNIT_KILOMETERS
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
