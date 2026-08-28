package v1_test

import (
	"context"
	"log"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"

	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/repo"
	handlers "github.com/crlssn/getstronger/server/rpc/handlers/v1"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/xcontext"
)

type feedSuite struct {
	suite.Suite

	repo    *repo.Repo
	handler apiv1connect.FeedServiceHandler

	factory   *factory.Factory
	container *container.Container
}

func TestFeedSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(feedSuite))
}

func (s *feedSuite) SetupSuite() {
	ctx := context.Background()
	s.container = container.NewContainer(ctx)
	s.factory = factory.NewFactory(s.container.DB)
	s.repo = repo.New(s.container.DB)
	s.handler = handlers.NewFeedHandler(s.repo)

	s.T().Cleanup(func() {
		if err := s.container.Terminate(ctx); err != nil {
			log.Fatalf("Clean container: %s", err)
		}
	})
}

func (s *feedSuite) TestListFeedItemsMarksPersonalBestsOfWorkoutOwners() {
	viewer := s.factory.NewUser()
	owner := s.factory.NewUser()

	ctx := xcontext.WithUserID(context.Background(), viewer.ID.String())
	ctx = xcontext.WithLogger(ctx, zap.NewExample())

	s.Require().NoError(s.repo.Follow(ctx, repo.FollowParams{
		FollowerID: viewer.ID.String(),
		FolloweeID: owner.ID.String(),
	}))

	exercise := s.factory.NewExercise(
		factory.ExerciseUserID(owner.ID),
		factory.ExerciseMetrics("weight", "reps"),
	)
	workout := s.factory.NewWorkout(factory.WorkoutUserID(owner.ID))
	bestSet := s.factory.NewSet(
		factory.SetUserID(owner.ID),
		factory.SetWorkoutID(workout.ID),
		factory.SetExerciseID(exercise.ID),
		factory.SetWeight(100),
		factory.SetReps(10),
	)
	lesserSet := s.factory.NewSet(
		factory.SetUserID(owner.ID),
		factory.SetWorkoutID(workout.ID),
		factory.SetExerciseID(exercise.ID),
		factory.SetWeight(50),
		factory.SetReps(5),
	)

	res, err := s.handler.ListFeedItems(ctx, &connect.Request[apiv1.ListFeedItemsRequest]{
		Msg: &apiv1.ListFeedItemsRequest{
			FollowedOnly: true,
			Pagination:   &apiv1.PaginationRequest{PageLimit: 10},
		},
	})
	s.Require().NoError(err)
	s.Require().Len(res.Msg.GetItems(), 1)

	feedWorkout := res.Msg.GetItems()[0].GetWorkout()
	s.Require().Equal(workout.ID.String(), feedWorkout.GetId())
	s.Require().Len(feedWorkout.GetExerciseSets(), 1)

	personalBests := make(map[string]bool)
	for _, set := range feedWorkout.GetExerciseSets()[0].GetSets() {
		personalBests[set.GetId()] = set.GetMetadata().GetPersonalBest()
	}
	s.Require().True(personalBests[bestSet.ID.String()])
	s.Require().False(personalBests[lesserSet.ID.String()])
}

func (s *feedSuite) TestListFeedItemsPaginates() {
	viewer := s.factory.NewUser()
	now := time.Now().UTC()
	for i := range 3 {
		s.factory.NewWorkout(
			factory.WorkoutUserID(viewer.ID),
			factory.WorkoutCreatedAt(now.Add(-time.Duration(i)*time.Second)),
		)
	}

	ctx := xcontext.WithUserID(context.Background(), viewer.ID.String())
	ctx = xcontext.WithLogger(ctx, zap.NewExample())

	first, err := s.handler.ListFeedItems(ctx, &connect.Request[apiv1.ListFeedItemsRequest]{
		Msg: &apiv1.ListFeedItemsRequest{
			FollowedOnly: true,
			Pagination:   &apiv1.PaginationRequest{PageLimit: 2},
		},
	})
	s.Require().NoError(err)
	s.Require().Len(first.Msg.GetItems(), 2)
	s.Require().NotEmpty(first.Msg.GetPagination().GetNextPageToken())

	second, err := s.handler.ListFeedItems(ctx, &connect.Request[apiv1.ListFeedItemsRequest]{
		Msg: &apiv1.ListFeedItemsRequest{
			FollowedOnly: true,
			Pagination: &apiv1.PaginationRequest{
				PageLimit: 2,
				PageToken: first.Msg.GetPagination().GetNextPageToken(),
			},
		},
	})
	s.Require().NoError(err)
	s.Require().Len(second.Msg.GetItems(), 1)
	s.Require().Empty(second.Msg.GetPagination().GetNextPageToken())
}

func (s *feedSuite) TestListFeedItemsRejectsAMalformedPageToken() {
	ctx := xcontext.WithUserID(context.Background(), uuid.NewString())
	ctx = xcontext.WithLogger(ctx, zap.NewExample())

	res, err := s.handler.ListFeedItems(ctx, &connect.Request[apiv1.ListFeedItemsRequest]{
		Msg: &apiv1.ListFeedItemsRequest{
			Pagination: &apiv1.PaginationRequest{PageLimit: 2, PageToken: []byte("not a token")},
		},
	})
	s.Require().Nil(res)
	s.Require().Equal(connect.CodeInternal, connect.CodeOf(err))
}
