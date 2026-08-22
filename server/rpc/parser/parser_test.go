package parser_test

import (
	"context"
	"database/sql"
	"fmt"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/crlssn/getstronger/server/gen/models"
	v1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/notification"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/weightunit"
)

type parserSuite struct {
	suite.Suite

	db      *sql.DB
	factory *factory.Factory
}

func TestParserSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(parserSuite))
}

func (s *parserSuite) SetupSuite() {
	ctx := context.Background()
	c := container.NewContainer(ctx)
	s.db = c.DB
	s.factory = factory.NewFactory(s.db)

	s.T().Cleanup(func() {
		if err := c.Terminate(ctx); err != nil {
			s.T().Fatal(fmt.Errorf("terminate container: %w", err))
		}
	})
}

func (s *parserSuite) TestExercise() {
	exercise := s.factory.NewExercise()
	parsed := parser.Exercise(exercise)

	s.Require().Equal(exercise.ID.String(), parsed.GetId())
	s.Require().Equal(exercise.UserID.String(), parsed.GetUserId())
	s.Require().Equal(exercise.Title, parsed.GetName())
	s.Require().Equal([]string(exercise.Tags), parsed.GetTags())
}

func (s *parserSuite) TestExerciseSlice() {
	exercises := s.factory.NewExerciseSlice(2)
	parsed := parser.ExerciseSlice(exercises)

	s.Require().Len(parsed, len(exercises))
	for i, exercise := range exercises {
		s.Require().Equal(exercise.ID.String(), parsed[i].GetId())
		s.Require().Equal(exercise.UserID.String(), parsed[i].GetUserId())
		s.Require().Equal(exercise.Title, parsed[i].GetName())
		s.Require().Equal([]string(exercise.Tags), parsed[i].GetTags())
	}
}

func (s *parserSuite) TestUser() {
	user := s.factory.NewUser()
	parsed := parser.User(user)
	s.Require().Equal(user.R.Auth.Email, parsed.GetEmail())

	parsed = parser.User(user, parser.UserFollowed(true))
	s.Require().True(parsed.GetFollowed())

	user.R.Auth = nil
	parsed = parser.User(user)
	s.Require().Equal(user.ID.String(), parsed.GetId())
	s.Require().Equal(user.Name, parsed.GetName())
	s.Require().False(parsed.GetFollowed())
	s.Require().Empty(parsed.GetEmail())
}

func (s *parserSuite) TestUserSlice() {
	users := s.factory.NewUserSlice(2)
	parsed := parser.UserSlice(users)

	s.Require().Len(parsed, len(users))
	for i, user := range users {
		s.Require().Equal(user.ID.String(), parsed[i].GetId())
		s.Require().Equal(user.Name, parsed[i].GetName())
		s.Require().Equal(user.R.Auth.Email, parsed[i].GetEmail())
		s.Require().False(parsed[i].GetFollowed())
	}
}

func (s *parserSuite) TestRoutine() {
	routine := s.factory.NewRoutine()
	parsed := parser.Routine(routine)

	s.Require().Equal(routine.ID.String(), parsed.GetId())
	s.Require().Equal(routine.Title, parsed.GetName())
	s.Require().Nil(parsed.GetExercises())

	routine = s.factory.NewRoutine()
	routine.R.Exercises = s.factory.NewExerciseSlice(2)
	parsed = parser.Routine(routine)

	s.Require().Len(parsed.GetExercises(), 2)
	for i, exercise := range routine.R.Exercises {
		s.Require().Equal(exercise.ID.String(), parsed.GetExercises()[i].GetId())
		s.Require().Equal(exercise.UserID.String(), parsed.GetExercises()[i].GetUserId())
		s.Require().Equal(exercise.Title, parsed.GetExercises()[i].GetName())
		s.Require().Equal([]string(exercise.Tags), parsed.GetExercises()[i].GetTags())
	}
}

func (s *parserSuite) TestRoutineSlice() {
	routines := s.factory.NewRoutineSlice(2)
	parsed := parser.RoutineSlice(routines)

	s.Require().Len(parsed, len(routines))
	for i, routine := range routines {
		s.Require().Equal(routine.ID.String(), parsed[i].GetId())
		s.Require().Equal(routine.Title, parsed[i].GetName())
		s.Require().Nil(parsed[i].GetExercises())
	}
}

func (s *parserSuite) TestRoutineWithGroups() {
	routine := s.factory.NewRoutine()
	exercises := s.factory.NewExerciseSlice(3)
	routine.R.Exercises = exercises

	parsed := parser.RoutineWithGroups(routine, []*training.RoutineGroup{
		{
			ID:        "group-straight",
			Mode:      training.RoutineGroupModeStraight,
			Exercises: exercises[:1],
		},
		{
			ID:                          "group-circuit",
			Mode:                        training.RoutineGroupModeCircuit,
			RestBetweenExercisesSeconds: 15,
			RestBetweenRoundsSeconds:    90,
			Exercises:                   exercises[1:],
		},
	})

	// The flat list stays whole: a client that does not care how the routine is
	// grouped keeps reading only that.
	s.Require().Len(parsed.GetExercises(), 3)
	s.Require().Len(parsed.GetGroups(), 2)

	straight := parsed.GetGroups()[0]
	s.Require().Equal("group-straight", straight.GetId())
	s.Require().Equal(v1.RoutineGroupMode_ROUTINE_GROUP_MODE_STRAIGHT, straight.GetMode())
	s.Require().Len(straight.GetExercises(), 1)

	circuit := parsed.GetGroups()[1]
	s.Require().Equal(v1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT, circuit.GetMode())
	s.Require().Equal(int32(15), circuit.GetRestBetweenExercisesSeconds())
	s.Require().Equal(int32(90), circuit.GetRestBetweenRoundsSeconds())
	s.Require().Len(circuit.GetExercises(), 2)
	s.Require().Equal(exercises[1].ID.String(), circuit.GetExercises()[0].GetId())
}

func (s *parserSuite) TestRoutineGroupMode() {
	s.Require().Equal(
		v1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT,
		parser.RoutineGroupModeToProto(training.RoutineGroupModeCircuit),
	)
	s.Require().Equal(
		v1.RoutineGroupMode_ROUTINE_GROUP_MODE_STRAIGHT,
		parser.RoutineGroupModeToProto(training.RoutineGroupModeStraight),
	)

	s.Require().Equal(
		training.RoutineGroupModeCircuit,
		parser.RoutineGroupModeFromProto(v1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT),
	)
	// Anything else is straight sets, which is what a routine that says nothing
	// about how it is worked through has always been.
	s.Require().Equal(
		training.RoutineGroupModeStraight,
		parser.RoutineGroupModeFromProto(v1.RoutineGroupMode_ROUTINE_GROUP_MODE_UNSPECIFIED),
	)
}

func (s *parserSuite) TestWorkout() {
	workout := s.factory.NewWorkout()
	workout.R.User = nil
	parsed := parser.Workout(workout)
	s.Require().Nil(parsed.GetUser())
	s.Require().Equal(workout.ID.String(), parsed.GetId())
	s.Require().Equal(workout.Name, parsed.GetName())
	s.Require().True(workout.StartedAt.Equal(parsed.GetStartedAt().AsTime()))
	s.Require().True(workout.FinishedAt.Equal(parsed.GetFinishedAt().AsTime()))

	workout = s.factory.NewWorkout()
	parsed = parser.Workout(workout)
	s.Require().Equal(workout.R.User.ID.String(), parsed.GetUser().GetId())
	s.Require().Equal(workout.R.User.Name, parsed.GetUser().GetName())
	s.Require().False(parsed.GetUser().GetFollowed())
	s.Require().Empty(parsed.GetUser().GetEmail())

	workout = s.factory.NewWorkout()
	parsed = parser.Workout(workout, parser.WorkoutIntensity(models.SetSlice{
		s.factory.NewSet(factory.SetReps(2), factory.SetWeight(5)),
		s.factory.NewSet(factory.SetReps(1), factory.SetWeight(10)),
	}))
	s.Require().Equal(20, int(parsed.GetIntensity()))

	workout = s.factory.NewWorkout()
	workout.R.WorkoutComments = models.WorkoutCommentSlice{
		s.factory.NewWorkoutComment(factory.WorkoutCommentWorkoutID(workout.ID)),
		s.factory.NewWorkoutComment(factory.WorkoutCommentWorkoutID(workout.ID)),
	}
	parsed = parser.Workout(workout)
	s.Require().Len(parsed.GetComments(), 2)
	for i, comment := range workout.R.WorkoutComments {
		s.Require().Equal(comment.ID.String(), parsed.GetComments()[i].GetId())
		s.Require().Equal(comment.UserID.String(), parsed.GetComments()[i].GetUser().GetId())
		s.Require().Equal(comment.Comment, parsed.GetComments()[i].GetComment())
	}

	workout = s.factory.NewWorkout()
	sets := s.factory.NewSetSlice(2)
	personalBests := models.SetSlice{sets[0]}
	parsed = parser.Workout(workout, parser.WorkoutExerciseSets(sets, personalBests))
	s.Require().Len(parsed.GetExerciseSets(), 2)
	for i, exerciseSet := range parsed.GetExerciseSets() {
		s.Require().Equal(sets[i].ExerciseID.String(), exerciseSet.GetExercise().GetId())
		for _, set := range exerciseSet.GetSets() {
			s.Require().Equal(sets[i].ID.String(), set.GetId())
			s.Require().InEpsilon(sets[i].Weight, set.GetWeight(), 0)
			s.Require().Equal(sets[i].Reps, set.GetReps())
			s.Require().Equal(sets[i].WorkoutID.String(), set.GetMetadata().GetWorkoutId())
			s.Require().True(sets[i].CreatedAt.Equal(set.GetMetadata().GetCreatedAt().AsTime()))
			s.Require().Equal(i == 0, set.GetMetadata().GetPersonalBest())
		}
	}

	workout = s.factory.NewWorkout(
		factory.WorkoutNote("note"),
	)
	parsed = parser.Workout(workout)
	s.Require().Equal(workout.Note.GetOrZero(), parsed.GetNote())
}

func (s *parserSuite) TestWorkoutSlice() {
	s.Run("ok_workouts_with_relationships", func() {
		workouts := models.WorkoutSlice{
			s.factory.NewWorkout(),
		}

		for _, workout := range workouts {
			workout.R.Sets = models.SetSlice{
				s.factory.NewSet(factory.SetWorkoutID(workout.ID)),
			}
		}

		personalBests := models.SetSlice{
			workouts[0].R.Sets[0],
		}

		parsed, err := parser.WorkoutSlice(workouts, personalBests)
		s.Require().NoError(err)
		s.Require().Len(parsed, len(workouts))

		for i, workout := range parsed {
			s.Require().Equal(workouts[i].ID.String(), workout.GetId())
			s.Require().Equal(workouts[i].Name, workout.GetName())
			s.Require().True(workouts[i].StartedAt.Equal(workout.GetStartedAt().AsTime()))
			s.Require().True(workouts[i].FinishedAt.Equal(workout.GetFinishedAt().AsTime()))

			s.Require().NotNil(workout.GetUser())
			s.Require().Equal(workouts[i].R.User.ID.String(), workout.GetUser().GetId())
			s.Require().Equal(workouts[i].R.User.Name, workout.GetUser().GetName())

			s.Require().NotNil(workout.GetExerciseSets())
			for j, exerciseSet := range workout.GetExerciseSets() {
				s.Require().Equal(workouts[i].R.Sets[j].ExerciseID.String(), exerciseSet.GetExercise().GetId())
				for _, set := range exerciseSet.GetSets() {
					s.Require().Equal(workouts[i].R.Sets[j].ID.String(), set.GetId())
					s.Require().InEpsilon(workouts[i].R.Sets[j].Weight, set.GetWeight(), 0)
					s.Require().Equal(workouts[i].R.Sets[j].Reps, set.GetReps())

					s.Require().NotNil(set.GetMetadata())
					s.Require().Equal(workouts[i].R.Sets[j].WorkoutID.String(), set.GetMetadata().GetWorkoutId())
					s.Require().True(workouts[i].R.Sets[j].CreatedAt.Equal(set.GetMetadata().GetCreatedAt().AsTime()))
					s.Require().Equal(i == 0 && j == 0, set.GetMetadata().GetPersonalBest())
				}
			}
		}
	})

	s.Run("ok_workout_without_relationship", func() {
		workout := s.factory.NewWorkout()
		workout.R = models.Workout{}.R

		parsed, err := parser.WorkoutSlice(models.WorkoutSlice{workout}, nil)
		s.Require().NoError(err)
		s.Require().Len(parsed, 1)
		s.Require().Equal(workout.ID.String(), parsed[0].GetId())
		s.Require().Nil(parsed[0].GetUser())
		s.Require().Empty(parsed[0].GetExerciseSets())
	})
}

func (s *parserSuite) TestWorkoutComment() {
	comment := s.factory.NewWorkoutComment()
	parsed := parser.WorkoutComment(comment)
	s.Require().Equal(comment.R.User.ID.String(), parsed.GetUser().GetId())
	s.Require().Equal(comment.R.User.Name, parsed.GetUser().GetName())
	s.Require().Empty(parsed.GetUser().GetEmail())
	s.Require().False(parsed.GetUser().GetFollowed())

	comment.R.User = nil
	parsed = parser.WorkoutComment(comment)
	s.Require().Equal(comment.ID.String(), parsed.GetId())
	s.Require().Empty(parsed.GetUser().GetId())
	s.Require().Equal(comment.Comment, parsed.GetComment())
	s.Require().True(comment.CreatedAt.Equal(parsed.GetCreatedAt().AsTime()))
}

func (s *parserSuite) TestExerciseSetsSlice() {
	sets := s.factory.NewSetSlice(1)
	parsed := parser.ExerciseSetsSlice(sets)

	s.Require().Len(parsed, len(sets))
	for i, exerciseSets := range parsed {
		s.Require().Equal(sets[i].ExerciseID.String(), exerciseSets.GetExercise().GetId())
		s.Require().Empty(exerciseSets.GetExercise().GetTags())
		s.Require().NotEmpty(exerciseSets.GetExercise().GetName())
		s.Require().NotEmpty(exerciseSets.GetExercise().GetUserId())

		for _, set := range exerciseSets.GetSets() {
			s.Require().Equal(sets[i].ID.String(), set.GetId())
			s.Require().InEpsilon(sets[i].Weight, set.GetWeight(), 0)
			s.Require().Equal(sets[i].Reps, set.GetReps())
			s.Require().Equal(sets[i].WorkoutID.String(), set.GetMetadata().GetWorkoutId())
			s.Require().True(sets[i].CreatedAt.Equal(set.GetMetadata().GetCreatedAt().AsTime()))
			s.Require().False(set.GetMetadata().GetPersonalBest())
		}
	}

	personalBests := models.SetSlice{sets[0]}
	parsed = parser.ExerciseSetsSlice(sets, parser.ExerciseSetsPersonalBests(personalBests))
	s.Require().Len(parsed, len(sets))
	for i, exerciseSets := range parsed {
		s.Require().Equal(sets[i].ExerciseID.String(), exerciseSets.GetExercise().GetId())
		s.Require().Empty(exerciseSets.GetExercise().GetTags())
		s.Require().NotEmpty(exerciseSets.GetExercise().GetName())
		s.Require().NotEmpty(exerciseSets.GetExercise().GetUserId())

		for _, set := range exerciseSets.GetSets() {
			s.Require().Equal(sets[i].ID.String(), set.GetId())
			s.Require().InEpsilon(sets[i].Weight, set.GetWeight(), 0)
			s.Require().Equal(sets[i].Reps, set.GetReps())
			s.Require().Equal(sets[i].WorkoutID.String(), set.GetMetadata().GetWorkoutId())
			s.Require().True(sets[i].CreatedAt.Equal(set.GetMetadata().GetCreatedAt().AsTime()))
			s.Require().Equal(i == 0, set.GetMetadata().GetPersonalBest())
		}
	}
}

func (s *parserSuite) TestExerciseSetSlice() {
	sets := s.factory.NewSetSlice(2)
	parsed := parser.ExerciseSetSlice(sets)

	s.Require().Len(parsed, len(sets))
	for i, exerciseSet := range parsed {
		s.Require().Equal(sets[i].ID.String(), exerciseSet.GetSet().GetId())
		s.Require().InEpsilon(sets[i].Weight, exerciseSet.GetSet().GetWeight(), 0)
		s.Require().Equal(sets[i].Reps, exerciseSet.GetSet().GetReps())
		s.Require().Equal(sets[i].WorkoutID.String(), exerciseSet.GetSet().GetMetadata().GetWorkoutId())
		s.Require().True(sets[i].CreatedAt.Equal(exerciseSet.GetSet().GetMetadata().GetCreatedAt().AsTime()))
		s.Require().False(exerciseSet.GetSet().GetMetadata().GetPersonalBest())
	}
}

func (s *parserSuite) TestExerciseSetsFromPB() {
	sets := parser.ExerciseSetsSlice(s.factory.NewSetSlice(2))
	parsed := parser.ExerciseSetsFromPB(sets)

	s.Require().Len(parsed, len(sets))
	for i, exerciseSets := range parsed {
		s.Require().Equal(sets[i].GetExercise().GetId(), exerciseSets.ExerciseID)
		s.Require().Len(exerciseSets.Sets, len(sets[i].GetSets()))
		for j, set := range exerciseSets.Sets {
			s.Require().Equal(sets[i].GetSets()[j].GetId(), set.ID)
			s.Require().InEpsilon(sets[i].GetSets()[j].GetWeight(), set.Weight, 0)
			s.Require().Equal(int(sets[i].GetSets()[j].GetReps()), set.Reps)
		}
	}
}

func (s *parserSuite) TestNotification() {
	record := s.factory.NewNotification(
		factory.NotificationType(notification.TypeWorkoutComment),
	)
	parsed := parser.Notification(record)

	s.Require().Equal(record.ID.String(), parsed.GetId())
	s.Require().Equal(record.CreatedAt.Unix(), parsed.GetNotifiedAtUnix())
	s.Require().False(parsed.GetRead())
	s.Require().Nil(parsed.GetUserFollowed())
	s.Require().Nil(parsed.GetWorkoutComment().GetActor())
	s.Require().Nil(parsed.GetWorkoutComment().GetWorkout())

	actor := s.factory.NewUser()
	parsed = parser.Notification(record, parser.NotificationActor(record.Type, actor))

	s.Require().NotNil(parsed.GetWorkoutComment().GetActor())
	s.Require().Equal(actor.ID.String(), parsed.GetWorkoutComment().GetActor().GetId())
	s.Require().Equal(actor.Name, parsed.GetWorkoutComment().GetActor().GetName())
	s.Require().Empty(parsed.GetUserFollowed().GetActor().GetEmail())
	s.Require().False(parsed.GetWorkoutComment().GetActor().GetFollowed())

	s.Require().Nil(parsed.GetUserFollowed())
	s.Require().Nil(parsed.GetWorkoutComment().GetWorkout())

	workout := s.factory.NewWorkout()
	parsed = parser.Notification(record, parser.NotificationWorkout(record.Type, workout))

	s.Require().NotNil(parsed.GetWorkoutComment().GetWorkout())
	s.Require().Equal(workout.ID.String(), parsed.GetWorkoutComment().GetWorkout().GetId())
	s.Require().Equal(workout.Name, parsed.GetWorkoutComment().GetWorkout().GetName())
	s.Require().True(workout.StartedAt.Equal(parsed.GetWorkoutComment().GetWorkout().GetStartedAt().AsTime()))
	s.Require().True(workout.FinishedAt.Equal(parsed.GetWorkoutComment().GetWorkout().GetFinishedAt().AsTime()))

	s.Require().NotNil(parsed.GetWorkoutComment().GetWorkout().GetUser())
	s.Require().Equal(workout.R.User.ID.String(), parsed.GetWorkoutComment().GetWorkout().GetUser().GetId())
	s.Require().Equal(workout.R.User.Name, parsed.GetWorkoutComment().GetWorkout().GetUser().GetName())
	s.Require().Empty(parsed.GetWorkoutComment().GetWorkout().GetUser().GetEmail())
	s.Require().False(parsed.GetWorkoutComment().GetWorkout().GetUser().GetFollowed())

	s.Require().Nil(parsed.GetUserFollowed())
	s.Require().Nil(parsed.GetWorkoutComment().GetWorkout().GetComments())
	s.Require().Nil(parsed.GetWorkoutComment().GetWorkout().GetExerciseSets())

	parsed = parser.Notification(
		record,
		parser.NotificationActor(record.Type, actor),
		parser.NotificationWorkout(record.Type, workout),
	)

	s.Require().NotNil(actor.ID, parsed.GetWorkoutComment().GetActor())
	s.Require().Equal(actor.ID.String(), parsed.GetWorkoutComment().GetActor().GetId())
	s.Require().Equal(actor.Name, parsed.GetWorkoutComment().GetActor().GetName())
	s.Require().Empty(parsed.GetUserFollowed().GetActor().GetEmail())
	s.Require().False(parsed.GetWorkoutComment().GetActor().GetFollowed())

	s.Require().NotNil(parsed.GetWorkoutComment().GetWorkout())
	s.Require().Equal(workout.ID.String(), parsed.GetWorkoutComment().GetWorkout().GetId())
	s.Require().Equal(workout.Name, parsed.GetWorkoutComment().GetWorkout().GetName())
	s.Require().True(workout.StartedAt.Equal(parsed.GetWorkoutComment().GetWorkout().GetStartedAt().AsTime()))
	s.Require().True(workout.FinishedAt.Equal(parsed.GetWorkoutComment().GetWorkout().GetFinishedAt().AsTime()))

	s.Require().NotNil(parsed.GetWorkoutComment().GetWorkout().GetUser())
	s.Require().Equal(workout.R.User.ID.String(), parsed.GetWorkoutComment().GetWorkout().GetUser().GetId())
	s.Require().Equal(workout.R.User.Name, parsed.GetWorkoutComment().GetWorkout().GetUser().GetName())
	s.Require().Empty(parsed.GetWorkoutComment().GetWorkout().GetUser().GetEmail())
	s.Require().False(parsed.GetWorkoutComment().GetWorkout().GetUser().GetFollowed())

	s.Require().Nil(parsed.GetUserFollowed())
	s.Require().Nil(parsed.GetWorkoutComment().GetWorkout().GetComments())
	s.Require().Nil(parsed.GetWorkoutComment().GetWorkout().GetExerciseSets())

	record = s.factory.NewNotification(
		factory.NotificationType(notification.TypeFollow),
	)
	parsed = parser.Notification(record)

	s.Require().Equal(record.ID.String(), parsed.GetId())
	s.Require().Equal(record.CreatedAt.Unix(), parsed.GetNotifiedAtUnix())

	s.Require().Nil(parsed.GetWorkoutComment())
	s.Require().Nil(parsed.GetUserFollowed().GetActor())

	readNotification := s.factory.NewNotification(
		factory.NotificationType(notification.TypeFollow),
		factory.NotificationRead(),
	)
	s.Require().True(parser.Notification(readNotification).GetRead())

	actor = s.factory.NewUser()
	parsed = parser.Notification(record, parser.NotificationActor(record.Type, actor))

	s.Require().Equal(actor.ID.String(), parsed.GetUserFollowed().GetActor().GetId())
	s.Require().Equal(actor.Name, parsed.GetUserFollowed().GetActor().GetName())
	s.Require().Equal(actor.R.Auth.Email, parsed.GetUserFollowed().GetActor().GetEmail())
	s.Require().False(parsed.GetUserFollowed().GetActor().GetFollowed())

	s.Require().Nil(parsed.GetWorkoutComment())
}

func (s *parserSuite) TestNotificationSlice() {
	actors := s.factory.NewUserSlice(2)
	workouts := s.factory.NewWorkoutSlice(1)
	notifications := models.NotificationSlice{
		s.factory.NewNotification(
			factory.NotificationType(notification.TypeFollow),
			factory.NotificationPayload(notification.Payload{
				ActorID: actors[0].ID.String(),
			}),
		),
		s.factory.NewNotification(
			factory.NotificationType(notification.TypeWorkoutComment),
			factory.NotificationPayload(notification.Payload{
				ActorID:   actors[1].ID.String(),
				WorkoutID: workouts[0].ID.String(),
			}),
		),
	}

	parsed, err := parser.NotificationSlice(notifications, actors, workouts)
	s.Require().NoError(err)
	s.Require().Len(parsed, len(notifications))
	for i, record := range parsed {
		s.Require().Equal(notifications[i].ID.String(), record.GetId())
		s.Require().Equal(notifications[i].CreatedAt.Unix(), record.GetNotifiedAtUnix())

		switch notifications[i].Type {
		case notification.TypeFollow:
			s.Require().NotNil(record.GetUserFollowed())
		case notification.TypeWorkoutComment:
			s.Require().NotNil(record.GetWorkoutComment())
		default:
			s.FailNow(fmt.Sprintf("unexpected record type: %v", notifications[i].Type))
		}

		switch i {
		case 0:
			s.Require().NotNil(record.GetUserFollowed())

			s.Require().NotNil(record.GetUserFollowed().GetActor())
			s.Require().Equal(actors[0].ID.String(), record.GetUserFollowed().GetActor().GetId())
			s.Require().Equal(actors[0].Name, record.GetUserFollowed().GetActor().GetName())
			s.Require().Equal(actors[0].R.Auth.Email, record.GetUserFollowed().GetActor().GetEmail())
			s.Require().False(record.GetUserFollowed().GetActor().GetFollowed())

			s.Require().Nil(record.GetWorkoutComment())
		case 1:
			s.Require().NotNil(record.GetWorkoutComment())

			s.Require().NotNil(record.GetWorkoutComment().GetActor())
			s.Require().Equal(actors[1].ID.String(), record.GetWorkoutComment().GetActor().GetId())
			s.Require().Equal(actors[1].Name, record.GetWorkoutComment().GetActor().GetName())
			s.Require().Equal(actors[1].R.Auth.Email, record.GetWorkoutComment().GetActor().GetEmail())
			s.Require().False(record.GetWorkoutComment().GetActor().GetFollowed())

			s.Require().NotNil(record.GetWorkoutComment().GetWorkout())
			s.Require().Equal(workouts[0].ID.String(), record.GetWorkoutComment().GetWorkout().GetId())
			s.Require().Equal(workouts[0].Name, record.GetWorkoutComment().GetWorkout().GetName())
			s.Require().True(workouts[0].StartedAt.Equal(record.GetWorkoutComment().GetWorkout().GetStartedAt().AsTime()))
			s.Require().True(workouts[0].FinishedAt.Equal(record.GetWorkoutComment().GetWorkout().GetFinishedAt().AsTime()))

			s.Require().NotNil(record.GetWorkoutComment().GetWorkout().GetUser())
			s.Require().Equal(workouts[0].R.User.ID.String(), record.GetWorkoutComment().GetWorkout().GetUser().GetId())
			s.Require().Equal(workouts[0].R.User.Name, record.GetWorkoutComment().GetWorkout().GetUser().GetName())
			s.Require().False(record.GetWorkoutComment().GetWorkout().GetUser().GetFollowed())
			s.Require().Empty(record.GetWorkoutComment().GetWorkout().GetUser().GetEmail())

			s.Require().Nil(record.GetUserFollowed())
			s.Require().Nil(record.GetWorkoutComment().GetWorkout().GetComments())
			s.Require().Nil(record.GetWorkoutComment().GetWorkout().GetExerciseSets())
		default:
			s.FailNow(fmt.Sprintf("unexpected record index: %d", i))
		}
	}
}

func (s *parserSuite) TestFeedItemSlice() {
	workouts := s.factory.NewWorkoutSlice(1)
	for _, workout := range workouts {
		workout.R.Sets = s.factory.NewSetSlice(1, factory.SetWorkoutID(workout.ID))
	}

	parsed, err := parser.FeedItemSlice(workouts, nil)
	s.Require().NoError(err)
	s.Require().Len(parsed, len(workouts))
	for i, feedItem := range parsed {
		switch i {
		case 0:
			s.Require().NotNil(feedItem.GetWorkout())
			s.Require().Equal(workouts[i].ID.String(), feedItem.GetWorkout().GetId())
			s.Require().Equal(workouts[i].Name, feedItem.GetWorkout().GetName())
			s.Require().True(workouts[i].StartedAt.Equal(feedItem.GetWorkout().GetStartedAt().AsTime()))
			s.Require().True(workouts[i].FinishedAt.Equal(feedItem.GetWorkout().GetFinishedAt().AsTime()))

			s.Require().NotNil(feedItem.GetWorkout().GetUser())
			s.Require().Equal(workouts[i].R.User.ID.String(), feedItem.GetWorkout().GetUser().GetId())
			s.Require().Equal(workouts[i].R.User.Name, feedItem.GetWorkout().GetUser().GetName())
			s.Require().False(feedItem.GetWorkout().GetUser().GetFollowed())
			s.Require().Empty(feedItem.GetWorkout().GetUser().GetEmail())

			s.Require().NotNil(feedItem.GetWorkout().GetExerciseSets())
			s.Require().Len(feedItem.GetWorkout().GetExerciseSets(), len(workouts[i].R.Sets))
			for j, exerciseSet := range feedItem.GetWorkout().GetExerciseSets() {
				for _, set := range exerciseSet.GetSets() {
					s.Require().Equal(workouts[i].R.Sets[j].ID.String(), set.GetId())
					s.Require().InEpsilon(workouts[i].R.Sets[j].Weight, set.GetWeight(), 0)
					s.Require().Equal(workouts[i].R.Sets[j].Reps, set.GetReps())
					s.Require().Equal(workouts[i].R.Sets[j].WorkoutID.String(), set.GetMetadata().GetWorkoutId())
					s.Require().True(workouts[i].R.Sets[j].CreatedAt.Equal(set.GetMetadata().GetCreatedAt().AsTime()))
					s.Require().False(set.GetMetadata().GetPersonalBest())
				}
			}

			s.Require().Nil(feedItem.GetWorkout().GetComments())
		default:
			s.FailNow(fmt.Sprintf("unexpected feed item index: %d", i))
		}
	}
}

func (s *parserSuite) TestSet() {
	set := s.factory.NewSet()
	parsed := parser.Set(set, nil)

	s.Require().Equal(set.ID.String(), parsed.GetId())
	s.Require().InEpsilon(set.Weight, parsed.GetWeight(), 0)
	s.Require().Equal(set.Reps, parsed.GetReps())
	s.Require().Equal(set.WorkoutID.String(), parsed.GetMetadata().GetWorkoutId())
	s.Require().True(set.CreatedAt.Equal(parsed.GetMetadata().GetCreatedAt().AsTime()))
	s.Require().False(parsed.GetMetadata().GetPersonalBest())

	mapPersonalBests := map[string]struct{}{set.ID.String(): {}}
	parsed = parser.Set(set, mapPersonalBests)
	s.Require().True(parsed.GetMetadata().GetPersonalBest())
}

func (s *parserSuite) TestSetRestoresEnteredPounds() {
	set := s.factory.NewSet(
		factory.SetWeight(45.36),
		factory.SetWeightUnit(weightunit.Pounds),
	)
	parsed := parser.Set(set, nil)

	s.Require().Equal(v1.WeightUnit_WEIGHT_UNIT_POUNDS, parsed.GetWeightUnit())
	s.Require().InEpsilon(100, parsed.GetWeight(), 0.001)
}

func (s *parserSuite) TestSetSlice() {
	sets := s.factory.NewSetSlice(2)
	parsed := parser.SetSlice(sets, nil)

	s.Require().Len(parsed, len(sets))
	for i, set := range parsed {
		s.Require().Equal(sets[i].ID.String(), set.GetId())
		s.Require().InEpsilon(sets[i].Weight, set.GetWeight(), 0)
		s.Require().Equal(sets[i].Reps, set.GetReps())
		s.Require().Equal(sets[i].WorkoutID.String(), set.GetMetadata().GetWorkoutId())
		s.Require().True(sets[i].CreatedAt.Equal(set.GetMetadata().GetCreatedAt().AsTime()))
		s.Require().False(set.GetMetadata().GetPersonalBest())
	}

	personalBests := models.SetSlice{sets[0]}
	parsed = parser.SetSlice(sets, personalBests)
	s.Require().Len(parsed, len(sets))
	for i, set := range parsed {
		s.Require().Equal(sets[i].ID.String(), set.GetId())
		s.Require().InEpsilon(sets[i].Weight, set.GetWeight(), 0)
		s.Require().Equal(sets[i].Reps, set.GetReps())
		s.Require().Equal(sets[i].WorkoutID.String(), set.GetMetadata().GetWorkoutId())
		s.Require().True(sets[i].CreatedAt.Equal(set.GetMetadata().GetCreatedAt().AsTime()))
		s.Require().Equal(i == 0, set.GetMetadata().GetPersonalBest())
	}
}
