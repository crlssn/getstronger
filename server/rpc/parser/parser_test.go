package parser_test

import (
	"context"
	"database/sql"
	"fmt"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/crlssn/getstronger/server/gen/orm"
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

	s.Require().Equal(user.ID, parsed.GetId())
	s.Require().Equal(user.FirstName, parsed.GetFirstName())
	s.Require().Equal(user.LastName, parsed.GetLastName())
	s.Require().False(parsed.GetFollowed())
	s.Require().Empty(parsed.GetEmail())

	auth := s.factory.NewAuth()
	parsed = parser.User(user, parser.UserEmail(auth))
	s.Require().Equal(auth.Email, parsed.GetEmail())

	parsed = parser.User(user, parser.UserFollowed(true))
	s.Require().True(parsed.GetFollowed())
}

func (s *parserSuite) TestUserSlice() {
	users := orm.UserSlice{s.factory.NewUser(), s.factory.NewUser()}
	parsed := parser.UserSlice(users)

	s.Require().Len(parsed, len(users))
	for i, user := range users {
		s.Require().Equal(user.ID, parsed[i].GetId())
		s.Require().Equal(user.FirstName, parsed[i].GetFirstName())
		s.Require().Equal(user.LastName, parsed[i].GetLastName())
		s.Require().False(parsed[i].GetFollowed())
		s.Require().Empty(parsed[i].GetEmail())
	}
}

func (s *parserSuite) TestRoutine() {
	routine := s.factory.NewRoutine()
	parsed := parser.Routine(routine)

	s.Require().Equal(routine.ID, parsed.GetId())
	s.Require().Equal(routine.Title, parsed.GetName())
	s.Require().Nil(parsed.GetExercises())

	routine = s.factory.NewRoutine()
	s.factory.AddRoutineExercise(routine, s.factory.NewExercise(), s.factory.NewExercise())
	parsed = parser.Routine(routine, parser.RoutineExercises(routine.R.Exercises))

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
	user := s.factory.NewUser()
	parsed = parser.Workout(workout, parser.WorkoutUser(user))

	s.Require().Equal(user.ID, parsed.GetUser().GetId())
	s.Require().Equal(user.FirstName, parsed.GetUser().GetFirstName())
	s.Require().Equal(user.LastName, parsed.GetUser().GetLastName())
	s.Require().False(parsed.GetUser().GetFollowed())
	s.Require().Empty(parsed.GetUser().GetEmail())

	workout = s.factory.NewWorkout()
	comments := orm.WorkoutCommentSlice{
		s.factory.NewWorkoutComment(factory.WorkoutCommentWorkoutID(workout.ID)),
		s.factory.NewWorkoutComment(factory.WorkoutCommentWorkoutID(workout.ID)),
	}

	parsed = parser.Workout(workout, parser.WorkoutComments(comments))
	s.Require().Len(parsed.GetComments(), 2)
	for i, comment := range comments {
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
			s.factory.NewWorkout(),
		}

		for _, workout := range workouts {
			workout.R.Sets = orm.SetSlice{
				s.factory.NewSet(factory.SetWorkoutID(workout.ID)),
				s.factory.NewSet(factory.SetWorkoutID(workout.ID)),
			}
		}

		personalBests := orm.SetSlice{
			workouts[0].R.Sets[0],
		}

		parsed, err := parser.WorkoutSlice(workouts, personalBests)
		s.Require().NoError(err)
		s.Require().Len(parsed, len(workouts))

		for i, workout := range workouts {
			s.Require().Equal(workout.ID, parsed[i].GetId())
			s.Require().Equal(workout.Name, parsed[i].GetName())
			s.Require().True(workout.StartedAt.Equal(parsed[i].GetStartedAt().AsTime()))
			s.Require().True(workout.FinishedAt.Equal(parsed[i].GetFinishedAt().AsTime()))

			s.Require().NotNil(workout.R.User)
			s.Require().Equal(workout.R.User.ID, parsed[i].GetUser().GetId())
			s.Require().Equal(workout.R.User.FirstName, parsed[i].GetUser().GetFirstName())
			s.Require().Equal(workout.R.User.LastName, parsed[i].GetUser().GetLastName())

			for j, exerciseSet := range parsed[i].GetExerciseSets() {
				s.Require().Equal(workout.R.Sets[j].ExerciseID, exerciseSet.GetExercise().GetId())
				for _, set := range exerciseSet.GetSets() {
					s.Require().Equal(workout.R.Sets[j].ID, set.GetId())
					s.Require().InEpsilon(workout.R.Sets[j].Weight, set.GetWeight(), 0)
					s.Require().Equal(workout.R.Sets[j].Reps, int(set.GetReps()))
					s.Require().Equal(workout.R.Sets[j].WorkoutID, set.GetMetadata().GetWorkoutId())
					s.Require().True(workout.R.Sets[j].CreatedAt.Equal(set.GetMetadata().GetCreatedAt().AsTime()))
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
outs