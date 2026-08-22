package v1_test

import (
	"context"
	"log"
	"testing"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/distanceunit"
	v1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc"
	handlers "github.com/crlssn/getstronger/server/rpc/handlers/v1"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/weightunit"
	"github.com/crlssn/getstronger/server/xcontext"
)

type userSuite struct {
	suite.Suite

	repo    repo.Repo
	handler apiv1connect.UserServiceHandler

	factory   *factory.Factory
	container *container.Container
}

func TestUserSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(userSuite))
}

func (s *userSuite) SetupSuite() {
	ctx := context.Background()
	s.container = container.NewContainer(ctx)
	s.factory = factory.NewFactory(s.container.DB)
	s.repo = repo.New(s.container.DB)
	s.handler = handlers.NewUserHandler(s.repo, nil)

	s.T().Cleanup(func() {
		if err := s.container.Terminate(ctx); err != nil {
			log.Fatalf("Clean container: %s", err)
		}
	})
}

func (s *userSuite) TestUpdateUserName() {
	s.Run("ok_name_updated_and_trimmed", func() {
		user := s.factory.NewUser()
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, user.ID.String())

		res, err := s.handler.UpdateUserName(ctx, &connect.Request[v1.UpdateUserNameRequest]{
			Msg: &v1.UpdateUserNameRequest{Name: "  Robin Fields  "},
		})
		s.Require().NoError(err)
		s.Require().Equal("Robin Fields", res.Msg.GetUser().GetName())

		persisted, err := s.repo.GetUser(ctx, repo.GetUserWithID(user.ID.String()))
		s.Require().NoError(err)
		s.Require().Equal("Robin Fields", persisted.Name)
	})

	s.Run("err_update_reports_nothing_about_the_account", func() {
		// An update that matches no row is the handler's internal-error path;
		// what it must not do is leak that the account is missing.
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, uuid.NewString())

		res, err := s.handler.UpdateUserName(ctx, &connect.Request[v1.UpdateUserNameRequest]{
			Msg: &v1.UpdateUserNameRequest{Name: "Robin Fields"},
		})
		s.Require().Nil(res)
		s.Require().Error(err)
		s.Require().Equal(connect.NewError(connect.CodeInternal, nil).Error(), err.Error())
	})
}

func (s *userSuite) TestUpdateUserUsername() {
	s.Run("ok_username_updated_and_lowercased", func() {
		user := s.factory.NewUser()
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, user.ID.String())

		res, err := s.handler.UpdateUserUsername(ctx, &connect.Request[v1.UpdateUserUsernameRequest]{
			Msg: &v1.UpdateUserUsernameRequest{Username: "Fresh.Handle"},
		})
		s.Require().NoError(err)
		s.Require().Equal("fresh.handle", res.Msg.GetUser().GetUsername())

		persisted, err := s.repo.GetUser(ctx, repo.GetUserWithID(user.ID.String()))
		s.Require().NoError(err)
		s.Require().Equal("fresh.handle", persisted.Username)
	})

	s.Run("err_username_taken_case_insensitively", func() {
		s.factory.NewUser(factory.UserUsername("held.handle"))
		user := s.factory.NewUser()
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, user.ID.String())

		res, err := s.handler.UpdateUserUsername(ctx, &connect.Request[v1.UpdateUserUsernameRequest]{
			Msg: &v1.UpdateUserUsernameRequest{Username: "Held.Handle"},
		})
		s.Require().Nil(res)
		s.Require().Error(err)
		expected := rpc.Error(connect.CodeAlreadyExists, v1.Error_ERROR_USERNAME_TAKEN)
		s.Require().Equal(expected.Error(), err.Error())
	})
}

func (s *userSuite) TestUpdateUserWeightUnit() {
	type expected struct {
		err        error
		weightUnit v1.WeightUnit
	}

	type test struct {
		name     string
		req      *connect.Request[v1.UpdateUserWeightUnitRequest]
		init     func(t test) context.Context
		expected expected
	}

	tests := []test{
		{
			name: "ok_weight_unit_updated_to_pounds",
			req: &connect.Request[v1.UpdateUserWeightUnitRequest]{
				Msg: &v1.UpdateUserWeightUnitRequest{
					WeightUnit: v1.WeightUnit_WEIGHT_UNIT_POUNDS,
				},
			},
			init: func(_ test) context.Context {
				user := s.factory.NewUser(factory.UserWeightUnit(weightunit.Kilograms))
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID.String())
			},
			expected: expected{
				err:        nil,
				weightUnit: v1.WeightUnit_WEIGHT_UNIT_POUNDS,
			},
		},
		{
			name: "ok_weight_unit_updated_to_kilograms",
			req: &connect.Request[v1.UpdateUserWeightUnitRequest]{
				Msg: &v1.UpdateUserWeightUnitRequest{
					WeightUnit: v1.WeightUnit_WEIGHT_UNIT_KILOGRAMS,
				},
			},
			init: func(_ test) context.Context {
				user := s.factory.NewUser(factory.UserWeightUnit(weightunit.Pounds))
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID.String())
			},
			expected: expected{
				err:        nil,
				weightUnit: v1.WeightUnit_WEIGHT_UNIT_KILOGRAMS,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			ctx := t.init(t)
			res, err := s.handler.UpdateUserWeightUnit(ctx, t.req)

			if t.expected.err != nil {
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(res)
			s.Require().Equal(t.expected.weightUnit, res.Msg.GetUser().GetWeightUnit())

			userID := xcontext.MustExtractUserID(ctx)
			user, err := s.repo.GetUser(ctx, repo.GetUserWithID(userID))
			s.Require().NoError(err)
			s.Require().Equal(t.expected.weightUnit, parser.WeightUnitToProto(user.WeightUnit))
		})
	}
}

func (s *userSuite) TestUpdateUserAutofillSets() {
	type test struct {
		name    string
		initial bool
		enabled bool
	}

	tests := []test{
		{name: "ok_autofill_enabled", initial: false, enabled: true},
		{name: "ok_autofill_disabled", initial: true, enabled: false},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			user := s.factory.NewUser(factory.UserAutofillSets(t.initial))
			ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
			ctx = xcontext.WithUserID(ctx, user.ID.String())

			res, err := s.handler.UpdateUserAutofillSets(ctx, &connect.Request[v1.UpdateUserAutofillSetsRequest]{
				Msg: &v1.UpdateUserAutofillSetsRequest{Enabled: t.enabled},
			})
			s.Require().NoError(err)
			s.Require().NotNil(res)
			s.Require().Equal(t.enabled, res.Msg.GetUser().GetAutofillSets())

			stored, err := s.repo.GetUser(ctx, repo.GetUserWithID(user.ID.String()))
			s.Require().NoError(err)
			s.Require().Equal(t.enabled, stored.AutofillSets)
		})
	}
}

// The email address belongs to the account holder alone: every signed-in user
// can look up every other profile, so anything returned here is public.
func (s *userSuite) TestGetUser_EmailAddressVisibility() {
	s.Run("ok_own_profile_carries_the_email_address", func() {
		auth := s.factory.NewAuth()
		user := s.factory.NewUser(factory.UserAuthID(auth.ID))
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, user.ID.String())

		res, err := s.handler.GetUser(ctx, &connect.Request[v1.GetUserRequest]{
			Msg: &v1.GetUserRequest{Id: user.ID.String()},
		})
		s.Require().NoError(err)
		s.Require().Equal(auth.Email, res.Msg.GetUser().GetEmail())
	})

	s.Run("ok_another_profile_withholds_the_email_address", func() {
		auth := s.factory.NewAuth()
		user := s.factory.NewUser(factory.UserAuthID(auth.ID))
		viewer := s.factory.NewUser()
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, viewer.ID.String())

		res, err := s.handler.GetUser(ctx, &connect.Request[v1.GetUserRequest]{
			Msg: &v1.GetUserRequest{Id: user.ID.String()},
		})
		s.Require().NoError(err)
		s.Require().Equal(user.Name, res.Msg.GetUser().GetName())
		s.Require().Empty(res.Msg.GetUser().GetEmail())
	})
}

// A brand new account keeps the prefill off until it is asked for.
func (s *userSuite) TestGetUserAutofillSetsDefaultsOff() {
	user := s.factory.NewUser()
	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	ctx = xcontext.WithUserID(ctx, user.ID.String())

	res, err := s.handler.GetUser(ctx, &connect.Request[v1.GetUserRequest]{
		Msg: &v1.GetUserRequest{Id: user.ID.String()},
	})
	s.Require().NoError(err)
	s.Require().False(res.Msg.GetUser().GetAutofillSets())
}

// Changing a unit preference must never rewrite the units historical sets were
// entered in.
func (s *userSuite) TestUpdateUserUnitPreferences_PreserveHistoricalSetUnits() {
	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	user := s.factory.NewUser(
		factory.UserWeightUnit(weightunit.Kilograms),
		factory.UserDistanceUnit(distanceunit.Kilometers),
	)
	ctx = xcontext.WithUserID(ctx, user.ID.String())

	set := s.factory.NewSet(
		factory.SetUserID(user.ID.String()),
		factory.SetWeightUnit(weightunit.Pounds),
		factory.SetDistanceUnit(distanceunit.Miles),
	)

	_, err := s.handler.UpdateUserWeightUnit(ctx, &connect.Request[v1.UpdateUserWeightUnitRequest]{
		Msg: &v1.UpdateUserWeightUnitRequest{
			WeightUnit: v1.WeightUnit_WEIGHT_UNIT_KILOGRAMS,
		},
	})
	s.Require().NoError(err)

	_, err = s.handler.UpdateUserDistanceUnit(ctx, &connect.Request[v1.UpdateUserDistanceUnitRequest]{
		Msg: &v1.UpdateUserDistanceUnitRequest{
			DistanceUnit: v1.DistanceUnit_DISTANCE_UNIT_KILOMETERS,
		},
	})
	s.Require().NoError(err)

	persisted, err := s.repo.ListSets(ctx, repo.ListSetsWithID(set.ID.String()))
	s.Require().NoError(err)
	s.Require().Len(persisted, 1)
	s.Require().Equal(string(weightunit.Pounds), persisted[0].WeightUnit)
	s.Require().Equal(string(distanceunit.Miles), persisted[0].DistanceUnit)
}

func (s *userSuite) TestUpdateUserDistanceUnit() {
	tests := []struct {
		name     string
		current  distanceunit.Unit
		update   v1.DistanceUnit
		expected v1.DistanceUnit
	}{
		{
			name:     "ok_distance_unit_updated_to_miles",
			current:  distanceunit.Kilometers,
			update:   v1.DistanceUnit_DISTANCE_UNIT_MILES,
			expected: v1.DistanceUnit_DISTANCE_UNIT_MILES,
		},
		{
			name:     "ok_distance_unit_updated_to_kilometers",
			current:  distanceunit.Miles,
			update:   v1.DistanceUnit_DISTANCE_UNIT_KILOMETERS,
			expected: v1.DistanceUnit_DISTANCE_UNIT_KILOMETERS,
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			user := s.factory.NewUser(factory.UserDistanceUnit(t.current))
			ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
			ctx = xcontext.WithUserID(ctx, user.ID.String())

			res, err := s.handler.UpdateUserDistanceUnit(ctx, &connect.Request[v1.UpdateUserDistanceUnitRequest]{
				Msg: &v1.UpdateUserDistanceUnitRequest{
					DistanceUnit: t.update,
				},
			})
			s.Require().NoError(err)
			s.Require().NotNil(res)
			s.Require().Equal(t.expected, res.Msg.GetUser().GetDistanceUnit())

			persisted, err := s.repo.GetUser(ctx, repo.GetUserWithID(user.ID.String()))
			s.Require().NoError(err)
			s.Require().Equal(t.expected, parser.DistanceUnitToProto(persisted.DistanceUnit))
		})
	}
}
