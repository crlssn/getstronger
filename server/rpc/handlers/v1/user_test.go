package v1_test

import (
	"context"
	"log"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/stephenafamo/bob"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/distanceunit"
	"github.com/crlssn/getstronger/server/gen/models"
	v1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/events"
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

	repo    *repo.Repo
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
	// FollowUser publishes, so the suite needs a real bus: nothing subscribes,
	// which leaves the event persisted and buffered, exactly as a dropped one is.
	s.handler = handlers.NewUserHandler(s.repo, pubsub.New(pubsub.Params{
		Log:   zap.NewExample(),
		Store: s.repo,
	}))

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

	// A reserved name answers exactly as a held one does, so that the endpoint
	// cannot be used to map out which names the app keeps for itself.
	s.Run("err_username_reserved", func() {
		user := s.factory.NewUser()
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, user.ID.String())

		for _, username := range []string{"Get.Stronger", "login"} {
			res, err := s.handler.UpdateUserUsername(ctx, &connect.Request[v1.UpdateUserUsernameRequest]{
				Msg: &v1.UpdateUserUsernameRequest{Username: username},
			})
			s.Require().Nil(res)
			s.Require().Error(err)
			expected := rpc.Error(connect.CodeAlreadyExists, v1.Error_ERROR_USERNAME_TAKEN)
			s.Require().Equal(expected.Error(), err.Error())
		}

		// The refusal changed nothing.
		persisted, err := s.repo.GetUser(ctx, repo.GetUserWithID(user.ID.String()))
		s.Require().NoError(err)
		s.Require().Equal(user.Username, persisted.Username)
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

// A follower, a profile, and someone that profile follows — the one graph both
// list procedures read from opposite ends.
func (s *userSuite) followGraph() (context.Context, *models.User, *models.User, *models.User) {
	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	follower := s.factory.NewUser()
	user := s.factory.NewUser()
	followee := s.factory.NewUser()

	s.Require().NoError(s.repo.Follow(ctx, repo.FollowParams{
		FollowerID: follower.ID.String(),
		FolloweeID: user.ID.String(),
	}))
	s.Require().NoError(s.repo.Follow(ctx, repo.FollowParams{
		FollowerID: user.ID.String(),
		FolloweeID: followee.ID.String(),
	}))

	return ctx, follower, user, followee
}

// The request field names the profile whose followers are wanted, not one of
// the people in the list that comes back.
func (s *userSuite) TestListFollowers() {
	ctx, follower, user, _ := s.followGraph()

	res, err := s.handler.ListFollowers(ctx, &connect.Request[v1.ListFollowersRequest]{
		Msg: &v1.ListFollowersRequest{UserId: user.ID.String()},
	})
	s.Require().NoError(err)
	s.Require().Len(res.Msg.GetFollowers(), 1)
	s.Require().Equal(follower.ID.String(), res.Msg.GetFollowers()[0].GetId())
}

// As above, the field names the profile being read rather than anyone it follows.
func (s *userSuite) TestListFollowees() {
	ctx, _, user, followee := s.followGraph()

	res, err := s.handler.ListFollowees(ctx, &connect.Request[v1.ListFolloweesRequest]{
		Msg: &v1.ListFolloweesRequest{UserId: user.ID.String()},
	})
	s.Require().NoError(err)
	s.Require().Len(res.Msg.GetFollowees(), 1)
	s.Require().Equal(followee.ID.String(), res.Msg.GetFollowees()[0].GetId())
}

// searchable returns a query no other test's users can match, and the users
// that do match it. Their names are identical, so similarity cannot order them
// and the tiebreak is what has to keep the pages disjoint.
func (s *userSuite) searchable(count int) (string, map[string]bool) {
	query := strings.ReplaceAll(uuid.NewString(), "-", "")
	ids := make(map[string]bool, count)
	for range count {
		user := s.factory.NewUser(factory.UserName(query + " lifter"))
		ids[user.ID.String()] = true
	}

	return query, ids
}

func (s *userSuite) searchUsers(ctx context.Context, query string, limit int32, token []byte) *v1.SearchUsersResponse {
	res, err := s.handler.SearchUsers(ctx, &connect.Request[v1.SearchUsersRequest]{
		Msg: &v1.SearchUsersRequest{
			Query: query,
			Pagination: &v1.PaginationRequest{
				PageLimit: limit,
				PageToken: token,
			},
		},
	})
	s.Require().NoError(err)

	return res.Msg
}

func (s *userSuite) TestSearchUsersReturnsTheNextPage() {
	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	query, expected := s.searchable(3)

	first := s.searchUsers(ctx, query, 2, nil)
	s.Require().Len(first.GetUsers(), 2)
	s.Require().NotEmpty(first.GetPagination().GetNextPageToken())

	second := s.searchUsers(ctx, query, 2, first.GetPagination().GetNextPageToken())
	s.Require().Len(second.GetUsers(), 1)
	s.Require().Empty(second.GetPagination().GetNextPageToken())

	seen := make(map[string]bool, len(expected))
	for _, user := range append(first.GetUsers(), second.GetUsers()...) {
		s.Require().False(seen[user.GetId()], "user %s returned on both pages", user.GetId())
		seen[user.GetId()] = true
	}
	s.Require().Equal(expected, seen)
}

// Pages are cut out of the similarity ranking, not out of a re-sorted first
// page: the further a name drifts from the query, the later it must appear.
func (s *userSuite) TestSearchUsersPagesInRankOrder() {
	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	query := strings.ReplaceAll(uuid.NewString(), "-", "")

	ranked := make([]string, 0, 3)
	for _, suffix := range []string{"", " a", " a much longer trailing name"} {
		ranked = append(ranked, s.factory.NewUser(factory.UserName(query+suffix)).ID.String())
	}

	got := make([]string, 0, len(ranked))
	var token []byte
	for range ranked {
		page := s.searchUsers(ctx, query, 1, token)
		s.Require().Len(page.GetUsers(), 1)
		got = append(got, page.GetUsers()[0].GetId())
		token = page.GetPagination().GetNextPageToken()
	}

	s.Require().Equal(ranked, got)
	s.Require().Empty(token)
}

// A token the server did not issue must fail rather than quietly fall back to
// the first page, which is what an opt with nowhere to put its error did.
func (s *userSuite) TestSearchUsersFailsOnAMalformedPageToken() {
	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())

	_, err := s.handler.SearchUsers(ctx, &connect.Request[v1.SearchUsersRequest]{
		Msg: &v1.SearchUsersRequest{
			Query:      "anyone",
			Pagination: &v1.PaginationRequest{PageLimit: 2, PageToken: []byte("not json")},
		},
	})
	s.Require().Equal(connect.CodeInternal, connect.CodeOf(err))
}

func (s *userSuite) TestFollowUser() {
	s.Run("ok_follow_is_recorded_and_announced", func() {
		follower := s.factory.NewUser()
		followee := s.factory.NewUser()
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, follower.ID.String())

		_, err := s.handler.FollowUser(ctx, &connect.Request[v1.FollowUserRequest]{
			Msg: &v1.FollowUserRequest{FollowId: followee.ID.String()},
		})
		s.Require().NoError(err)

		followed, err := s.repo.IsUserFollowedByUserID(ctx, followee, follower.ID.String())
		s.Require().NoError(err)
		s.Require().True(followed)

		s.Require().Eventually(func() bool {
			count, countErr := models.Events.Query(
				models.SelectWhere.Events.Topic.EQ(events.TopicFollowedUser),
			).Count(context.Background(), bob.NewDB(s.container.DB))
			return countErr == nil && count > 0
		}, 5*time.Second, 50*time.Millisecond)
	})

	s.Run("err_following_the_same_person_twice", func() {
		follower := s.factory.NewUser()
		followee := s.factory.NewUser()
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, follower.ID.String())

		req := &connect.Request[v1.FollowUserRequest]{
			Msg: &v1.FollowUserRequest{FollowId: followee.ID.String()},
		}
		_, err := s.handler.FollowUser(ctx, req)
		s.Require().NoError(err)

		res, err := s.handler.FollowUser(ctx, req)
		s.Require().Nil(res)
		s.Require().Equal(connect.NewError(connect.CodeInternal, nil).Error(), err.Error())
	})

	s.Run("err_following_somebody_who_does_not_exist", func() {
		follower := s.factory.NewUser()
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, follower.ID.String())

		res, err := s.handler.FollowUser(ctx, &connect.Request[v1.FollowUserRequest]{
			Msg: &v1.FollowUserRequest{FollowId: uuid.NewString()},
		})
		s.Require().Nil(res)
		s.Require().Equal(connect.NewError(connect.CodeInternal, nil).Error(), err.Error())
	})
}

func (s *userSuite) TestUnfollowUser() {
	s.Run("ok_follow_is_removed", func() {
		follower := s.factory.NewUser()
		followee := s.factory.NewUser()
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, follower.ID.String())
		s.Require().NoError(s.repo.Follow(ctx, repo.FollowParams{
			FollowerID: follower.ID.String(),
			FolloweeID: followee.ID.String(),
		}))

		_, err := s.handler.UnfollowUser(ctx, &connect.Request[v1.UnfollowUserRequest]{
			Msg: &v1.UnfollowUserRequest{UnfollowId: followee.ID.String()},
		})
		s.Require().NoError(err)

		followed, err := s.repo.IsUserFollowedByUserID(ctx, followee, follower.ID.String())
		s.Require().NoError(err)
		s.Require().False(followed)
	})

	// Deleting nothing is not an error: the client's view of who it follows may
	// simply be behind, and the end state it asked for is the one it gets.
	s.Run("ok_unfollowing_somebody_never_followed", func() {
		follower := s.factory.NewUser()
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, follower.ID.String())

		_, err := s.handler.UnfollowUser(ctx, &connect.Request[v1.UnfollowUserRequest]{
			Msg: &v1.UnfollowUserRequest{UnfollowId: uuid.NewString()},
		})
		s.Require().NoError(err)
	})
}

// The flag is about the reader, not the profile: the same profile is followed
// for one viewer and not for another.
func (s *userSuite) TestGetUserReportsWhetherTheViewerFollows() {
	ctx, follower, user, _ := s.followGraph()
	stranger := s.factory.NewUser()

	res, err := s.handler.GetUser(xcontext.WithUserID(ctx, follower.ID.String()),
		&connect.Request[v1.GetUserRequest]{Msg: &v1.GetUserRequest{Id: user.ID.String()}})
	s.Require().NoError(err)
	s.Require().True(res.Msg.GetUser().GetFollowed())

	res, err = s.handler.GetUser(xcontext.WithUserID(ctx, stranger.ID.String()),
		&connect.Request[v1.GetUserRequest]{Msg: &v1.GetUserRequest{Id: user.ID.String()}})
	s.Require().NoError(err)
	s.Require().False(res.Msg.GetUser().GetFollowed())
}

func (s *userSuite) TestGetUserNotFound() {
	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	ctx = xcontext.WithUserID(ctx, uuid.NewString())

	res, err := s.handler.GetUser(ctx, &connect.Request[v1.GetUserRequest]{
		Msg: &v1.GetUserRequest{Id: uuid.NewString()},
	})
	s.Require().Nil(res)
	s.Require().Equal(connect.NewError(connect.CodeNotFound, nil).Error(), err.Error())
}
