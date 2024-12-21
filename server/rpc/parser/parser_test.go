package parser_test

import (
	"context"
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

	factory *factory.Factory
}

func TestParserSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(parserSuite))
}

func (s *parserSuite) SetupSuite() {
	ctx := context.Background()
	c := container.NewContainer(ctx)
	s.factory = factory.NewFactory(c.DB)

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
