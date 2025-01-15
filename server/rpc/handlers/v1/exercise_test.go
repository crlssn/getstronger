package v1_test

import (
	"context"
	"encoding/json"
	"log"
	"sort"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/brianvoe/gofakeit/v7"
	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	"github.com/crlssn/getstronger/server/gen/orm"
	v1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/repo"
	handlers "github.com/crlssn/getstronger/server/rpc/handlers/v1"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/xcontext"
)

type exerciseSuite struct {
	suite.Suite

	handler apiv1connect.ExerciseServiceHandler

	factory       *factory.Factory
	testContainer *container.Container
}

func TestExerciseSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(exerciseSuite))
}

func (s *exerciseSuite) SetupSuite() {
	ctx := context.Background()
	s.testContainer = container.NewContainer(ctx)
	s.factory = factory.NewFactory(s.testContainer.DB)
	s.handler = handlers.NewExerciseHandler(repo.New(s.testContainer.DB))

	s.T().Cleanup(func() {
		if err := s.testContainer.Terminate(ctx); err != nil {
			log.Fatalf("failed to clean container: %s", err)
		}
	})
}

func (s *exerciseSuite) TestCreateExercise() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		req      *connect.Request[v1.CreateExerciseRequest]
		init     func(t test) context.Context
		expected expected
	}

	tests := []test{
		{
			name: "ok_exercise_created",
			req: &connect.Request[v1.CreateExerciseRequest]{
				Msg: &v1.CreateExerciseRequest{
					Name:  "Name",
					Label: "Label",
				},
			},
			init: func(_ test) context.Context {
				user := s.factory.NewUser()
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: nil,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			ctx := t.init(t)

			res, err := s.handler.CreateExercise(ctx, t.req)
			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err.Error(), err.Error())
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(res)

			_, err = uuid.Parse(res.Msg.GetId())
			s.Require().NoError(err)

			exercise, err := orm.FindExercise(ctx, s.testContainer.DB, res.Msg.GetId())
			s.Require().NoError(err)
			s.Require().NotNil(exercise)
			s.Require().Equal(t.req.Msg.GetLabel(), exercise.SubTitle.String)
		})
	}
}

func (s *exerciseSuite) TestGetExercise() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		req      *connect.Request[v1.GetExerciseRequest]
		init     func(t test) context.Context
		expected expected
	}

	tests := []test{
		{
			name: "ok_exercise_found",
			req: &connect.Request[v1.GetExerciseRequest]{
				Msg: &v1.GetExerciseRequest{
					Id: uuid.NewString(),
				},
			},
			init: func(t test) context.Context {
				user := s.factory.NewUser()
				exercise := s.factory.NewExercise(
					factory.ExerciseID(t.req.Msg.GetId()),
					factory.ExerciseUserID(user.ID),
				)

				s.Require().NotNil(exercise)
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name: "err_exercise_not_found",
			req: &connect.Request[v1.GetExerciseRequest]{
				Msg: &v1.GetExerciseRequest{
					Id: uuid.NewString(),
				},
			},
			init: func(_ test) context.Context {
				user := s.factory.NewUser()
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: connect.NewError(connect.CodeNotFound, nil),
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			ctx := t.init(t)

			res, err := s.handler.GetExercise(ctx, t.req)
			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err.Error(), err.Error())
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(res)

			exercise, err := orm.FindExercise(ctx, s.testContainer.DB, res.Msg.GetExercise().GetId())
			s.Require().NoError(err)
			s.Require().NotNil(exercise)
			s.Require().Equal(t.req.Msg.GetId(), exercise.ID)
		})
	}
}

func (s *exerciseSuite) TestUpdateExercise() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		req      *connect.Request[v1.UpdateExerciseRequest]
		init     func(t test) context.Context
		expected expected
	}

	tests := []test{
		{
			name: "ok_exercise_name_updated",
			req: &connect.Request[v1.UpdateExerciseRequest]{
				Msg: &v1.UpdateExerciseRequest{
					Exercise: &v1.Exercise{
						Id:   uuid.NewString(),
						Name: "New Name",
					},
					UpdateMask: &fieldmaskpb.FieldMask{
						Paths: []string{"name"},
					},
				},
			},
			init: func(t test) context.Context {
				user := s.factory.NewUser()
				s.factory.NewExercise(
					factory.ExerciseID(t.req.Msg.GetExercise().GetId()),
					factory.ExerciseUserID(user.ID),
					factory.ExerciseTitle("Old Name"),
				)

				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name: "ok_exercise_label_updated",
			req: &connect.Request[v1.UpdateExerciseRequest]{
				Msg: &v1.UpdateExerciseRequest{
					Exercise: &v1.Exercise{
						Id:    uuid.NewString(),
						Name:  "Name",
						Label: "New Label",
					},
					UpdateMask: &fieldmaskpb.FieldMask{
						Paths: []string{"label"},
					},
				},
			},
			init: func(t test) context.Context {
				user := s.factory.NewUser()
				s.factory.NewExercise(
					factory.ExerciseID(t.req.Msg.GetExercise().GetId()),
					factory.ExerciseUserID(user.ID),
					factory.ExerciseTitle(t.req.Msg.GetExercise().GetName()),
					factory.ExerciseSubTitle("Old Label"),
				)

				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name: "ok_exercise_name_and_label_updated",
			req: &connect.Request[v1.UpdateExerciseRequest]{
				Msg: &v1.UpdateExerciseRequest{
					Exercise: &v1.Exercise{
						Id:    uuid.NewString(),
						Name:  "New Name",
						Label: "New Label",
					},
					UpdateMask: &fieldmaskpb.FieldMask{
						Paths: []string{"name", "label"},
					},
				},
			},
			init: func(t test) context.Context {
				user := s.factory.NewUser()
				s.factory.NewExercise(
					factory.ExerciseID(t.req.Msg.GetExercise().GetId()),
					factory.ExerciseUserID(user.ID),
					factory.ExerciseTitle("Old Name"),
					factory.ExerciseSubTitle("Old Label"),
				)

				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name: "err_exercise_not_found",
			req: &connect.Request[v1.UpdateExerciseRequest]{
				Msg: &v1.UpdateExerciseRequest{
					Exercise: &v1.Exercise{
						Id: uuid.NewString(),
					},
					UpdateMask: &fieldmaskpb.FieldMask{
						Paths: []string{"name"},
					},
				},
			},
			init: func(_ test) context.Context {
				user := s.factory.NewUser()
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: connect.NewError(connect.CodeFailedPrecondition, nil),
			},
		},
		{
			name: "err_invalid_update_mask_path",
			req: &connect.Request[v1.UpdateExerciseRequest]{
				Msg: &v1.UpdateExerciseRequest{
					Exercise: &v1.Exercise{
						Id: uuid.NewString(),
					},
					UpdateMask: &fieldmaskpb.FieldMask{
						Paths: []string{"invalid"},
					},
				},
			},
			init: func(t test) context.Context {
				user := s.factory.NewUser()
				s.factory.NewExercise(
					factory.ExerciseID(t.req.Msg.GetExercise().GetId()),
					factory.ExerciseUserID(user.ID),
				)

				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: connect.NewError(connect.CodeInvalidArgument, handlers.ErrInvalidUpdateMaskPath),
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			ctx := t.init(t)

			res, err := s.handler.UpdateExercise(ctx, t.req)
			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err.Error(), err.Error())
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(res)

			s.Require().Equal(t.req.Msg.GetExercise().GetId(), res.Msg.GetExercise().GetId())
			s.Require().Equal(t.req.Msg.GetExercise().GetName(), res.Msg.GetExercise().GetName())
			s.Require().Equal(t.req.Msg.GetExercise().GetLabel(), res.Msg.GetExercise().GetLabel())

			exercise, err := orm.FindExercise(ctx, s.testContainer.DB, res.Msg.GetExercise().GetId())
			s.Require().NoError(err)
			s.Require().NotNil(exercise)
			s.Require().Equal(t.req.Msg.GetExercise().GetName(), exercise.Title)
			s.Require().Equal(t.req.Msg.GetExercise().GetLabel(), exercise.SubTitle.String)
		})
	}
}

func (s *exerciseSuite) TestDeleteExercise() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		req      *connect.Request[v1.DeleteExerciseRequest]
		init     func(t test) context.Context
		expected expected
	}

	tests := []test{
		{
			name: "ok_exercise_deleted",
			req: &connect.Request[v1.DeleteExerciseRequest]{
				Msg: &v1.DeleteExerciseRequest{
					Id: uuid.NewString(),
				},
			},
			init: func(t test) context.Context {
				user := s.factory.NewUser()
				s.factory.NewExercise(
					factory.ExerciseID(t.req.Msg.GetId()),
					factory.ExerciseUserID(user.ID),
				)

				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name: "err_exercise_not_found",
			req: &connect.Request[v1.DeleteExerciseRequest]{
				Msg: &v1.DeleteExerciseRequest{
					Id: uuid.NewString(),
				},
			},
			init: func(_ test) context.Context {
				user := s.factory.NewUser()
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: connect.NewError(connect.CodeFailedPrecondition, nil),
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			ctx := t.init(t)

			res, err := s.handler.DeleteExercise(ctx, t.req)
			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err.Error(), err.Error())
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(res)

			exists, err := orm.Exercises(
				orm.ExerciseWhere.ID.EQ(t.req.Msg.GetId()),
				orm.ExerciseWhere.DeletedAt.IsNotNull(),
			).Exists(ctx, s.testContainer.DB)
			s.Require().NoError(err)
			s.Require().True(exists)
		})
	}
}

func (s *exerciseSuite) TestListExercises() { //nolint:maintidx
	type expected struct {
		err error
		res *v1.ListExercisesResponse
	}

	type test struct {
		name     string
		req      *connect.Request[v1.ListExercisesRequest]
		init     func(t test) context.Context
		expected expected
	}

	tests := []test{
		{
			name: "ok_list_exercises_with_pagination",
			req: &connect.Request[v1.ListExercisesRequest]{
				Msg: &v1.ListExercisesRequest{
					Pagination: &v1.PaginationRequest{
						PageLimit: 2,
					},
				},
			},
			init: func(t test) context.Context {
				now := time.Now()
				user := s.factory.NewUser(factory.UserID(factory.UUID(0)))

				s.factory.NewExercise(
					factory.ExerciseUserID(user.ID),
					factory.ExerciseCreatedAt(now),
				)

				var exercises orm.ExerciseSlice
				for _, exercise := range t.expected.res.GetExercises() {
					exercises = append(exercises, s.factory.NewExercise(
						factory.ExerciseID(exercise.GetId()),
						factory.ExerciseUserID(user.ID),
						factory.ExerciseTitle(exercise.GetName()),
						factory.ExerciseSubTitle(exercise.GetLabel()),
						factory.ExerciseCreatedAt(now.Add(time.Second)),
					))
				}

				sort.Slice(exercises, func(i, j int) bool {
					return exercises[i].CreatedAt.Before(exercises[j].CreatedAt)
				})

				nextPageToken, err := json.Marshal(repo.PageToken{CreatedAt: exercises[0].CreatedAt})
				s.Require().NoError(err)
				t.expected.res.Pagination.NextPageToken = nextPageToken

				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: nil,
				res: &v1.ListExercisesResponse{
					Exercises: []*v1.Exercise{
						{
							Id:     uuid.NewString(),
							UserId: factory.UUID(0),
							Name:   gofakeit.Name(),
							Label:  gofakeit.Word(),
						},
						{
							Id:     uuid.NewString(),
							UserId: factory.UUID(0),
							Name:   gofakeit.Name(),
							Label:  gofakeit.Word(),
						},
					},
					Pagination: &v1.PaginationResponse{},
				},
			},
		},
		{
			name: "ok_list_exercises_filtered_by_name",
			req: &connect.Request[v1.ListExercisesRequest]{
				Msg: &v1.ListExercisesRequest{
					Name: "Exercise Name",
					Pagination: &v1.PaginationRequest{
						PageLimit: 2,
					},
				},
			},
			init: func(t test) context.Context {
				user := s.factory.NewUser(factory.UserID(factory.UUID(1)))

				for _, exercise := range t.expected.res.GetExercises() {
					s.factory.NewExercise(
						factory.ExerciseID(exercise.GetId()),
						factory.ExerciseUserID(user.ID),
						factory.ExerciseTitle(exercise.GetName()),
						factory.ExerciseSubTitle(exercise.GetLabel()),
					)
				}

				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: nil,
				res: &v1.ListExercisesResponse{
					Exercises: []*v1.Exercise{
						{
							Id:     uuid.NewString(),
							UserId: factory.UUID(1),
							Name:   "Exercise Name",
							Label:  gofakeit.Word(),
						},
					},
					Pagination: &v1.PaginationResponse{},
				},
			},
		},
		{
			name: "ok_list_exercises_filtered_by_ids",
			req: &connect.Request[v1.ListExercisesRequest]{
				Msg: &v1.ListExercisesRequest{
					ExerciseIds: []string{factory.UUID(9)},
					Pagination: &v1.PaginationRequest{
						PageLimit: 2,
					},
				},
			},
			init: func(t test) context.Context {
				user := s.factory.NewUser(factory.UserID(factory.UUID(2)))

				for _, exercise := range t.expected.res.GetExercises() {
					s.factory.NewExercise(
						factory.ExerciseID(exercise.GetId()),
						factory.ExerciseUserID(user.ID),
						factory.ExerciseTitle(exercise.GetName()),
						factory.ExerciseSubTitle(exercise.GetLabel()),
					)
				}

				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: nil,
				res: &v1.ListExercisesResponse{
					Exercises: []*v1.Exercise{
						{
							Id:     factory.UUID(9),
							UserId: factory.UUID(2),
							Name:   gofakeit.Name(),
							Label:  gofakeit.Word(),
						},
					},
					Pagination: &v1.PaginationResponse{},
				},
			},
		},
		{
			name: "ok_list_exercises_filtered_by_name_and_id",
			req: &connect.Request[v1.ListExercisesRequest]{
				Msg: &v1.ListExercisesRequest{
					Name:        "Target",
					ExerciseIds: []string{factory.UUID(0)},
					Pagination: &v1.PaginationRequest{
						PageLimit: 2,
					},
				},
			},
			init: func(t test) context.Context {
				user := s.factory.NewUser(factory.UserID(factory.UUID(4)))

				for _, exercise := range t.expected.res.GetExercises() {
					s.factory.NewExercise(
						factory.ExerciseID(exercise.GetId()),
						factory.ExerciseUserID(user.ID),
						factory.ExerciseTitle(exercise.GetName()),
						factory.ExerciseSubTitle(exercise.GetLabel()),
					)
				}

				// Non-matching exercises
				s.factory.NewExercise(
					factory.ExerciseID(uuid.NewString()),       // ID not matching
					factory.ExerciseTitle(t.req.Msg.GetName()), // Name matching
					factory.ExerciseUserID(user.ID),
				)
				s.factory.NewExercise(
					factory.ExerciseID(uuid.NewString()),   // ID not matching
					factory.ExerciseTitle(gofakeit.Name()), // Name not matching
					factory.ExerciseUserID(user.ID),
				)

				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: nil,
				res: &v1.ListExercisesResponse{
					Exercises: []*v1.Exercise{
						{
							Id:     factory.UUID(0),
							UserId: factory.UUID(4),
							Name:   "Target",
							Label:  "Label",
						},
					},
					Pagination: &v1.PaginationResponse{},
				},
			},
		},
		{
			name: "ok_no_exercises_found",
			req: &connect.Request[v1.ListExercisesRequest]{
				Msg: &v1.ListExercisesRequest{},
			},
			init: func(_ test) context.Context {
				user := s.factory.NewUser(factory.UserID(factory.UUID(3)))

				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID)
			},
			expected: expected{
				err: nil,
				res: &v1.ListExercisesResponse{
					Exercises:  []*v1.Exercise{},
					Pagination: &v1.PaginationResponse{},
				},
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			ctx := t.init(t)

			res, err := s.handler.ListExercises(ctx, t.req)
			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err.Error(), err.Error())
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(res)

			s.Require().Equal(len(t.expected.res.GetExercises()), len(res.Msg.GetExercises()))
			for i, exercise := range res.Msg.GetExercises() {
				s.Require().Equal(t.expected.res.GetExercises()[i].GetId(), exercise.GetId())
				s.Require().Equal(t.expected.res.GetExercises()[i].GetName(), exercise.GetName())
				s.Require().Equal(t.expected.res.GetExercises()[i].GetLabel(), exercise.GetLabel())
			}

			s.Require().Equal(t.expected.res.GetPagination().GetNextPageToken(), res.Msg.GetPagination().GetNextPageToken())
		})
	}
}
