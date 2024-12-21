package parser_test

import (
	"context"
	"database/sql"
	"fmt"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
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
			s.T().Fatal(fmt.Errorf("failed to terminate container: %w", err))
		}
	})
}

func (s *parserSuite) TestExercise() {
	exercise := s.factory.NewExercise()
	parsed := parser.Exercise(exercise)

	s.Require().Equal(exercise.ID, parsed.GetId())
	s.Require().Equal(exercise.UserID, parsed.GetUserId())
	s.Require().Equal(exercise.Title, parsed.GetName())
	s.Require().Equal(exercise.SubTitle.String, parsed.GetLabel())
}

func (s *parserSuite) TestExerciseSlice() {
	exercises := orm.ExerciseSlice{s.factory.NewExercise(), s.factory.NewExercise()}
	parsed := parser.ExerciseSlice(exercises)

	s.Require().Len(parsed, len(exercises))
	for i, exercise := range exercises {
		s.Require().Equal(exercise.ID, parsed[i].GetId())
		s.Require().Equal(exercise.UserID, parsed[i].GetUserId())
		s.Require().Equal(exercise.Title, parsed[i].GetName())
		s.Require().Equal(exercise.SubTitle.String, parsed[i].GetLabel())
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
	s.Require().Equal(user.ID, parsed.GetId())
	s.Require().Equal(user.FirstName, parsed.GetFirstName())
	s.Require().Equal(user.LastName, parsed.GetLastName())
	s.Require().False(parsed.GetFollowed())
	s.Require().Empty(parsed.GetEmail())
}

func (s *parserSuite) TestUserSlice() {
	users := orm.UserSlice{s.factory.NewUser(), s.factory.NewUser()}
	parsed := parser.UserSlice(users)

	s.Require().Len(parsed, len(users))
	for i, user := range users {
		s.Require().Equal(user.ID, parsed[i].GetId())
		s.Require().Equal(user.FirstName, parsed[i].GetFirstName())
		s.Require().Equal(user.LastName, parsed[i].GetLastName())
		s.Require().Equal(user.R.Auth.Email, parsed[i].GetEmail())
		s.Require().False(parsed[i].GetFollowed())
	}
}

func (s *parserSuite) TestRoutine() {
	routine := s.factory.NewRoutine()
	parsed := parser.Routine(routine)

	s.Require().Equal(routine.ID, parsed.GetId())
	s.Require().Equal(routine.Title, parsed.GetName())
	s.Require().Nil(parsed.GetExercises())

	routine = s.factory.NewRoutine()
	routine.R.Exercises = orm.ExerciseSlice{
		s.factory.NewExercise(),
		s.factory.NewExercise(),
	}
	parsed = parser.Routine(routine)

	s.Require().Len(parsed.GetExercises(), 2)
	for i, exercise := range routine.R.Exercises {
		s.Require().Equal(exercise.ID, parsed.GetExercises()[i].GetId())
		s.Require().Equal(exercise.UserID, parsed.GetExercises()[i].GetUserId())
		s.Require().Equal(exercise.Title, parsed.GetExercises()[i].GetName())
		s.Require().Equal(exercise.SubTitle.String, parsed.GetExercises()[i].GetLabel())
	}
}

func (s *parserSuite) TestRoutineSlice() {
	routines := orm.RoutineSlice{s.factory.NewRoutine(), s.factory.NewRoutine()}
	parsed := parser.RoutineSlice(routines)

	s.Require().Len(parsed, len(routines))
	for i, routine := range routines {
		s.Require().Equal(routine.ID, parsed[i].GetId())
		s.Require().Equal(routine.Title, parsed[i].GetName())
		s.Require().Nil(parsed[i].GetExercises())
	}
}

func (s *parserSuite) TestWorkout() {
	workout := s.factory.NewWorkout()
	parsed := parser.Workout(workout)

	s.Require().Equal(workout.ID, parsed.GetId())
	s.Require().Equal(workout.Name, parsed.GetName())
	s.Require().True(workout.StartedAt.Equal(parsed.GetStartedAt().AsTime()))
	s.Require().True(workout.FinishedAt.Equal(parsed.GetFinishedAt().AsTime()))

	workout = s.factory.NewWorkout()
	parsed = parser.Workout(workout)

	s.Require().Equal(workout.R.User.ID, parsed.GetUser().GetId())
	s.Require().Equal(workout.R.User.FirstName, parsed.GetUser().GetFirstName())
	s.Require().Equal(workout.R.User.LastName, parsed.GetUser().GetLastName())
	s.Require().False(parsed.GetUser().GetFollowed())
	s.Require().Empty(parsed.GetUser().GetEmail())

	workout = s.factory.NewWorkout()
	workout.R.WorkoutComments = orm.WorkoutCommentSlice{
		s.factory.NewWorkoutComment(factory.WorkoutCommentWorkoutID(workout.ID)),
		s.factory.NewWorkoutComment(factory.WorkoutCommentWorkoutID(workout.ID)),
	}

	parsed = parser.Workout(workout)
	s.Require().Len(parsed.GetComments(), 2)
	for i, comment := range workout.R.WorkoutComments {
		s.Require().Equal(comment.ID, parsed.GetComments()[i].GetId())
		s.Require().Equal(comment.UserID, parsed.GetComments()[i].GetUser().GetId())
		s.Require().Equal(comment.Comment, parsed.GetComments()[i].GetComment())
	}

	workout = s.factory.NewWorkout()
	sets := orm.SetSlice{
		s.factory.NewSet(),
		s.factory.NewSet(),
	}
	personalBests := orm.SetSlice{sets[0]}

	parsed = parser.Workout(workout, parser.WorkoutExerciseSets(sets, personalBests))
	s.Require().Len(parsed.GetExerciseSets(), 2)
	for i, exerciseSet := range parsed.GetExerciseSets() {
		s.Require().Equal(sets[i].ExerciseID, exerciseSet.GetExercise().GetId())
		for _, set := range exerciseSet.GetSets() {
			s.Require().Equal(sets[i].ID, set.GetId())
			s.Require().InEpsilon(sets[i].Weight, set.GetWeight(), 0)
			s.Require().Equal(sets[i].Reps, int(set.GetReps()))
			s.Require().Equal(sets[i].WorkoutID, set.GetMetadata().GetWorkoutId())
			s.Require().True(sets[i].CreatedAt.Equal(set.GetMetadata().GetCreatedAt().AsTime()))
			s.Require().Equal(i == 0, set.GetMetadata().GetPersonalBest())
		}
	}
}

func (s *parserSuite) TestWorkoutSlice() {
	s.Run("ok_workouts_with_relationships", func() {
		workouts := orm.WorkoutSlice{
			s.factory.NewWorkout(),
		}

		for _, workout := range workouts {
			workout.R.Sets = orm.SetSlice{
				s.factory.NewSet(factory.SetWorkoutID(workout.ID)),
			}
		}

		personalBests := orm.SetSlice{
			workouts[0].R.Sets[0],
		}

		parsed, err := parser.WorkoutSlice(workouts, personalBests)
		s.Require().NoError(err)
		s.Require().Len(parsed, len(workouts))

		for i, workout := range parsed {
			s.Require().Equal(workouts[i].ID, workout.GetId())
			s.Require().Equal(workouts[i].Name, workout.GetName())
			s.Require().True(workouts[i].StartedAt.Equal(workout.GetStartedAt().AsTime()))
			s.Require().True(workouts[i].FinishedAt.Equal(workout.GetFinishedAt().AsTime()))

			s.Require().NotNil(workout.GetUser())
			s.Require().Equal(workouts[i].R.User.ID, workout.GetUser().GetId())
			s.Require().Equal(workouts[i].R.User.FirstName, workout.GetUser().GetFirstName())
			s.Require().Equal(workouts[i].R.User.LastName, workout.GetUser().GetLastName())

			s.Require().NotNil(workout.GetExerciseSets())
			for j, exerciseSet := range workout.GetExerciseSets() {
				s.Require().Equal(workouts[i].R.Sets[j].ExerciseID, exerciseSet.GetExercise().GetId())
				for _, set := range exerciseSet.GetSets() {
					s.Require().Equal(workouts[i].R.Sets[j].ID, set.GetId())
					s.Require().InEpsilon(workouts[i].R.Sets[j].Weight, set.GetWeight(), 0)
					s.Require().Equal(workouts[i].R.Sets[j].Reps, int(set.GetReps()))

					s.Require().NotNil(set.GetMetadata())
					s.Require().Equal(workouts[i].R.Sets[j].WorkoutID, set.GetMetadata().GetWorkoutId())
					s.Require().True(workouts[i].R.Sets[j].CreatedAt.Equal(set.GetMetadata().GetCreatedAt().AsTime()))
					s.Require().Equal(i == 0 && j == 0, set.GetMetadata().GetPersonalBest())
				}
			}
		}
	})

	s.Run("ok_workout_without_relationship", func() {
		workout := s.factory.NewWorkout()
		workout.R = nil

		parsed, err := parser.WorkoutSlice(orm.WorkoutSlice{workout}, nil)
		s.Require().NoError(err)
		s.Require().Len(parsed, 1)
		s.Require().Equal(workout.ID, parsed[0].GetId())
		s.Require().Nil(parsed[0].GetUser())
		s.Require().Empty(parsed[0].GetExerciseSets())
	})
}

func (s *parserSuite) TestWorkoutComment() {
	comment := s.factory.NewWorkoutComment()
	parsed := parser.WorkoutComment(comment)
	s.Require().Equal(comment.R.User.ID, parsed.GetUser().GetId())
	s.Require().Equal(comment.R.User.FirstName, parsed.GetUser().GetFirstName())
	s.Require().Equal(comment.R.User.LastName, parsed.GetUser().GetLastName())
	s.Require().Empty(parsed.GetUser().GetEmail())
	s.Require().False(parsed.GetUser().GetFollowed())

	comment.R.User = nil
	parsed = parser.WorkoutComment(comment)
	s.Require().Equal(comment.ID, parsed.GetId())
	s.Require().Empty(parsed.GetUser().GetId())
	s.Require().Equal(comment.Comment, parsed.GetComment())
	s.Require().True(comment.CreatedAt.Equal(parsed.GetCreatedAt().AsTime()))
}

func (s *parserSuite) TestExerciseSetsSlice() {
	sets := orm.SetSlice{s.factory.NewSet()}
	parsed := parser.ExerciseSetsSlice(sets)

	s.Require().Len(parsed, len(sets))
	for i, exerciseSets := range parsed {
		s.Require().Equal(sets[i].ExerciseID, exerciseSets.GetExercise().GetId())
		s.Require().Empty(exerciseSets.GetExercise().GetLabel())
		s.Require().NotEmpty(exerciseSets.GetExercise().GetName())
		s.Require().NotEmpty(exerciseSets.GetExercise().GetUserId())

		for _, set := range exerciseSets.GetSets() {
			s.Require().Equal(sets[i].ID, set.GetId())
			s.Require().InEpsilon(sets[i].Weight, set.GetWeight(), 0)
			s.Require().Equal(sets[i].Reps, int(set.GetReps()))
			s.Require().Equal(sets[i].WorkoutID, set.GetMetadata().GetWorkoutId())
			s.Require().True(sets[i].CreatedAt.Equal(set.GetMetadata().GetCreatedAt().AsTime()))
			s.Require().False(set.GetMetadata().GetPersonalBest())
		}
	}

	personalBests := orm.SetSlice{sets[0]}
	parsed = parser.ExerciseSetsSlice(sets, parser.ExerciseSetsPersonalBests(personalBests))
	s.Require().Len(parsed, len(sets))
	for i, exerciseSets := range parsed {
		s.Require().Equal(sets[i].ExerciseID, exerciseSets.GetExercise().GetId())
		s.Require().Empty(exerciseSets.GetExercise().GetLabel())
		s.Require().NotEmpty(exerciseSets.GetExercise().GetName())
		s.Require().NotEmpty(exerciseSets.GetExercise().GetUserId())

		for _, set := range exerciseSets.GetSets() {
			s.Require().Equal(sets[i].ID, set.GetId())
			s.Require().InEpsilon(sets[i].Weight, set.GetWeight(), 0)
			s.Require().Equal(sets[i].Reps, int(set.GetReps()))
			s.Require().Equal(sets[i].WorkoutID, set.GetMetadata().GetWorkoutId())
			s.Require().True(sets[i].CreatedAt.Equal(set.GetMetadata().GetCreatedAt().AsTime()))
			s.Require().Equal(i == 0, set.GetMetadata().GetPersonalBest())
		}
	}
}

func (s *parserSuite) TestExerciseSetSlice() {
	sets := orm.SetSlice{s.factory.NewSet(), s.factory.NewSet()}
	parsed := parser.ExerciseSetSlice(sets)

	s.Require().Len(parsed, len(sets))
	for i, exerciseSet := range parsed {
		s.Require().Equal(sets[i].ID, exerciseSet.GetSet().GetId())
		s.Require().InEpsilon(sets[i].Weight, exerciseSet.GetSet().GetWeight(), 0)
		s.Require().Equal(sets[i].Reps, int(exerciseSet.GetSet().GetReps()))
		s.Require().Equal(sets[i].WorkoutID, exerciseSet.GetSet().GetMetadata().GetWorkoutId())
		s.Require().True(sets[i].CreatedAt.Equal(exerciseSet.GetSet().GetMetadata().GetCreatedAt().AsTime()))
		s.Require().False(exerciseSet.GetSet().GetMetadata().GetPersonalBest())
	}
}

func (s *parserSuite) TestExerciseSetsFromPB() {
	sets := parser.ExerciseSetsSlice(orm.SetSlice{s.factory.NewSet(), s.factory.NewSet()})
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
	notification := s.factory.NewNotification(
		factory.NotificationType(orm.NotificationTypeWorkoutComment),
	)
	parsed := parser.Notification(notification)

	s.Require().Equal(notification.ID, parsed.GetId())
	s.Require().Equal(notification.CreatedAt.Unix(), parsed.GetNotifiedAtUnix())
	s.Require().Nil(parsed.GetUserFollowed())
	s.Require().Nil(parsed.GetWorkoutComment().GetActor())
	s.Require().Nil(parsed.GetWorkoutComment().GetWorkout())

	actor := s.factory.NewUser()
	parsed = parser.Notification(notification, parser.NotificationActor(notification.Type, actor))

	s.Require().NotNil(parsed.GetWorkoutComment().GetActor())
	s.Require().Equal(actor.ID, parsed.GetWorkoutComment().GetActor().GetId())
	s.Require().Equal(actor.FirstName, parsed.GetWorkoutComment().GetActor().GetFirstName())
	s.Require().Equal(actor.LastName, parsed.GetWorkoutComment().GetActor().GetLastName())
	s.Require().Empty(parsed.GetUserFollowed().GetActor().GetEmail())
	s.Require().False(parsed.GetWorkoutComment().GetActor().GetFollowed())

	s.Require().Nil(parsed.GetUserFollowed())
	s.Require().Nil(parsed.GetWorkoutComment().GetWorkout())

	workout := s.factory.NewWorkout()
	parsed = parser.Notification(notification, parser.NotificationWorkout(notification.Type, workout))

	s.Require().NotNil(parsed.GetWorkoutComment().GetWorkout())
	s.Require().Equal(workout.ID, parsed.GetWorkoutComment().GetWorkout().GetId())
	s.Require().Equal(workout.Name, parsed.GetWorkoutComment().GetWorkout().GetName())
	s.Require().True(workout.StartedAt.Equal(parsed.GetWorkoutComment().GetWorkout().GetStartedAt().AsTime()))
	s.Require().True(workout.FinishedAt.Equal(parsed.GetWorkoutComment().GetWorkout().GetFinishedAt().AsTime()))

	s.Require().NotNil(parsed.GetWorkoutComment().GetWorkout().GetUser())
	s.Require().Equal(workout.R.User.ID, parsed.GetWorkoutComment().GetWorkout().GetUser().GetId())
	s.Require().Equal(workout.R.User.FirstName, parsed.GetWorkoutComment().GetWorkout().GetUser().GetFirstName())
	s.Require().Equal(workout.R.User.LastName, parsed.GetWorkoutComment().GetWorkout().GetUser().GetLastName())
	s.Require().Empty(parsed.GetWorkoutComment().GetWorkout().GetUser().GetEmail())
	s.Require().False(parsed.GetWorkoutComment().GetWorkout().GetUser().GetFollowed())

	s.Require().Nil(parsed.GetUserFollowed())
	s.Require().Nil(parsed.GetWorkoutComment().GetWorkout().GetComments())
	s.Require().Nil(parsed.GetWorkoutComment().GetWorkout().GetExerciseSets())

	parsed = parser.Notification(notification,
		parser.NotificationActor(notification.Type, actor),
		parser.NotificationWorkout(notification.Type, workout),
	)

	s.Require().NotNil(actor.ID, parsed.GetWorkoutComment().GetActor())
	s.Require().Equal(actor.ID, parsed.GetWorkoutComment().GetActor().GetId())
	s.Require().Equal(actor.FirstName, parsed.GetWorkoutComment().GetActor().GetFirstName())
	s.Require().Equal(actor.LastName, parsed.GetWorkoutComment().GetActor().GetLastName())
	s.Require().Empty(parsed.GetUserFollowed().GetActor().GetEmail())
	s.Require().False(parsed.GetWorkoutComment().GetActor().GetFollowed())

	s.Require().NotNil(parsed.GetWorkoutComment().GetWorkout())
	s.Require().Equal(workout.ID, parsed.GetWorkoutComment().GetWorkout().GetId())
	s.Require().Equal(workout.Name, parsed.GetWorkoutComment().GetWorkout().GetName())
	s.Require().True(workout.StartedAt.Equal(parsed.GetWorkoutComment().GetWorkout().GetStartedAt().AsTime()))
	s.Require().True(workout.FinishedAt.Equal(parsed.GetWorkoutComment().GetWorkout().GetFinishedAt().AsTime()))

	s.Require().NotNil(parsed.GetWorkoutComment().GetWorkout().GetUser())
	s.Require().Equal(workout.R.User.ID, parsed.GetWorkoutComment().GetWorkout().GetUser().GetId())
	s.Require().Equal(workout.R.User.FirstName, parsed.GetWorkoutComment().GetWorkout().GetUser().GetFirstName())
	s.Require().Equal(workout.R.User.LastName, parsed.GetWorkoutComment().GetWorkout().GetUser().GetLastName())
	s.Require().Empty(parsed.GetWorkoutComment().GetWorkout().GetUser().GetEmail())
	s.Require().False(parsed.GetWorkoutComment().GetWorkout().GetUser().GetFollowed())

	s.Require().Nil(parsed.GetUserFollowed())
	s.Require().Nil(parsed.GetWorkoutComment().GetWorkout().GetComments())
	s.Require().Nil(parsed.GetWorkoutComment().GetWorkout().GetExerciseSets())

	notification = s.factory.NewNotification(
		factory.NotificationType(orm.NotificationTypeFollow),
	)
	parsed = parser.Notification(notification)

	s.Require().Equal(notification.ID, parsed.GetId())
	s.Require().Equal(notification.CreatedAt.Unix(), parsed.GetNotifiedAtUnix())

	s.Require().Nil(parsed.GetWorkoutComment())
	s.Require().Nil(parsed.GetUserFollowed().GetActor())

	actor = s.factory.NewUser()
	parsed = parser.Notification(notification, parser.NotificationActor(notification.Type, actor))

	s.Require().Equal(actor.ID, parsed.GetUserFollowed().GetActor().GetId())
	s.Require().Equal(actor.FirstName, parsed.GetUserFollowed().GetActor().GetFirstName())
	s.Require().Equal(actor.LastName, parsed.GetUserFollowed().GetActor().GetLastName())
	s.Require().Equal(actor.R.Auth.Email, parsed.GetUserFollowed().GetActor().GetEmail())
	s.Require().False(parsed.GetUserFollowed().GetActor().GetFollowed())

	s.Require().Nil(parsed.GetWorkoutComment())
}

func (s *parserSuite) TestNotificationSlice() {
	actors := orm.UserSlice{
		s.factory.NewUser(),
		s.factory.NewUser(),
	}
	workouts := orm.WorkoutSlice{
		s.factory.NewWorkout(),
	}
	notifications := orm.NotificationSlice{
		s.factory.NewNotification(
			factory.NotificationType(orm.NotificationTypeFollow),
			factory.NotificationPayload(repo.NotificationPayload{
				ActorID: actors[0].ID,
			}),
		),
		s.factory.NewNotification(
			factory.NotificationType(orm.NotificationTypeWorkoutComment),
			factory.NotificationPayload(repo.NotificationPayload{
				ActorID:   actors[1].ID,
				WorkoutID: workouts[0].ID,
			}),
		),
	}

	parsed, err := parser.NotificationSlice(notifications, actors, workouts)
	s.Require().NoError(err)
	s.Require().Len(parsed, len(notifications))
	for i, notification := range parsed {
		s.Require().Equal(notifications[i].ID, notification.GetId())
		s.Require().Equal(notifications[i].CreatedAt.Unix(), notification.GetNotifiedAtUnix())

		switch notifications[i].Type {
		case orm.NotificationTypeFollow:
			s.Require().NotNil(notification.GetUserFollowed())
		case orm.NotificationTypeWorkoutComment:
			s.Require().NotNil(notification.GetWorkoutComment())
		default:
			s.FailNow("unexpected notification type: %v", notifications[i].Type)
		}

		switch i {
		case 0:
			s.Require().NotNil(notification.GetUserFollowed())

			s.Require().NotNil(notification.GetUserFollowed().GetActor())
			s.Require().Equal(actors[0].ID, notification.GetUserFollowed().GetActor().GetId())
			s.Require().Equal(actors[0].FirstName, notification.GetUserFollowed().GetActor().GetFirstName())
			s.Require().Equal(actors[0].LastName, notification.GetUserFollowed().GetActor().GetLastName())
			s.Require().Equal(actors[0].R.Auth.Email, notification.GetUserFollowed().GetActor().GetEmail())
			s.Require().False(notification.GetUserFollowed().GetActor().GetFollowed())

			s.Require().Nil(notification.GetWorkoutComment())
		case 1:
			s.Require().NotNil(notification.GetWorkoutComment())

			s.Require().NotNil(notification.GetWorkoutComment().GetActor())
			s.Require().Equal(actors[1].ID, notification.GetWorkoutComment().GetActor().GetId())
			s.Require().Equal(actors[1].LastName, notification.GetWorkoutComment().GetActor().GetLastName())
			s.Require().Equal(actors[1].FirstName, notification.GetWorkoutComment().GetActor().GetFirstName())
			s.Require().Equal(actors[1].R.Auth.Email, notification.GetWorkoutComment().GetActor().GetEmail())
			s.Require().False(notification.GetWorkoutComment().GetActor().GetFollowed())

			s.Require().NotNil(notification.GetWorkoutComment().GetWorkout())
			s.Require().Equal(workouts[0].ID, notification.GetWorkoutComment().GetWorkout().GetId())
			s.Require().Equal(workouts[0].Name, notification.GetWorkoutComment().GetWorkout().GetName())
			s.Require().True(workouts[0].StartedAt.Equal(notification.GetWorkoutComment().GetWorkout().GetStartedAt().AsTime()))
			s.Require().True(workouts[0].FinishedAt.Equal(notification.GetWorkoutComment().GetWorkout().GetFinishedAt().AsTime()))

			s.Require().NotNil(notification.GetWorkoutComment().GetWorkout().GetUser())
			s.Require().Equal(workouts[0].R.User.ID, notification.GetWorkoutComment().GetWorkout().GetUser().GetId())
			s.Require().Equal(workouts[0].R.User.FirstName, notification.GetWorkoutComment().GetWorkout().GetUser().GetFirstName())
			s.Require().Equal(workouts[0].R.User.LastName, notification.GetWorkoutComment().GetWorkout().GetUser().GetLastName())
			s.Require().False(notification.GetWorkoutComment().GetWorkout().GetUser().GetFollowed())
			s.Require().Empty(notification.GetWorkoutComment().GetWorkout().GetUser().GetEmail())

			s.Require().Nil(notification.GetUserFollowed())
			s.Require().Nil(notification.GetWorkoutComment().GetWorkout().GetComments())
			s.Require().Nil(notification.GetWorkoutComment().GetWorkout().GetExerciseSets())
		default:
			s.FailNow("unexpected notification index: %d", i)
		}
	}
}

func (s *parserSuite) TestFeedItemSlice() {
	workouts := orm.WorkoutSlice{
		s.factory.NewWorkout(),
	}
	for _, workout := range workouts {
		workout.R.Sets = orm.SetSlice{
			s.factory.NewSet(factory.SetWorkoutID(workout.ID)),
		}
	}

	parsed, err := parser.FeedItemSlice(workouts, nil)
	s.Require().NoError(err)
	s.Require().Len(parsed, len(workouts))
	for i, feedItem := range parsed {
		switch i {
		case 0:
			s.Require().NotNil(feedItem.GetWorkout())
			s.Require().Equal(workouts[i].ID, feedItem.GetWorkout().GetId())
			s.Require().Equal(workouts[i].Name, feedItem.GetWorkout().GetName())
			s.Require().True(workouts[i].StartedAt.Equal(feedItem.GetWorkout().GetStartedAt().AsTime()))
			s.Require().True(workouts[i].FinishedAt.Equal(feedItem.GetWorkout().GetFinishedAt().AsTime()))

			s.Require().NotNil(feedItem.GetWorkout().GetUser())
			s.Require().Equal(workouts[i].R.User.ID, feedItem.GetWorkout().GetUser().GetId())
			s.Require().Equal(workouts[i].R.User.FirstName, feedItem.GetWorkout().GetUser().GetFirstName())
			s.Require().Equal(workouts[i].R.User.LastName, feedItem.GetWorkout().GetUser().GetLastName())
			s.Require().False(feedItem.GetWorkout().GetUser().GetFollowed())
			s.Require().Empty(feedItem.GetWorkout().GetUser().GetEmail())

			s.Require().NotNil(feedItem.GetWorkout().GetExerciseSets())
			s.Require().Len(feedItem.GetWorkout().GetExerciseSets(), len(workouts[i].R.Sets))
			for j, exerciseSet := range feedItem.GetWorkout().GetExerciseSets() {
				for _, set := range exerciseSet.GetSets() {
					s.Require().Equal(workouts[i].R.Sets[j].ID, set.GetId())
					s.Require().InEpsilon(workouts[i].R.Sets[j].Weight, set.GetWeight(), 0)
					s.Require().Equal(workouts[i].R.Sets[j].Reps, int(set.GetReps()))
					s.Require().Equal(workouts[i].R.Sets[j].WorkoutID, set.GetMetadata().GetWorkoutId())
					s.Require().True(workouts[i].R.Sets[j].CreatedAt.Equal(set.GetMetadata().GetCreatedAt().AsTime()))
					s.Require().False(set.GetMetadata().GetPersonalBest())
				}
			}

			s.Require().Nil(feedItem.GetWorkout().GetComments())
		default:
			s.FailNow("unexpected feed item index: %d", i)
		}
	}
}

func (s *parserSuite) TestSet() {
	set := s.factory.NewSet()
	parsed := parser.Set(set, nil)

	s.Require().Equal(set.ID, parsed.GetId())
	s.Require().InEpsilon(set.Weight, parsed.GetWeight(), 0)
	s.Require().Equal(set.Reps, int(parsed.GetReps()))
	s.Require().Equal(set.WorkoutID, parsed.GetMetadata().GetWorkoutId())
	s.Require().True(set.CreatedAt.Equal(parsed.GetMetadata().GetCreatedAt().AsTime()))
	s.Require().False(parsed.GetMetadata().GetPersonalBest())
}
