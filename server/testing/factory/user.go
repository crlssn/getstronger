package factory

import (
	"context"
	"fmt"

	"github.com/aarondl/opt/omit"
	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/im"

	"github.com/crlssn/getstronger/server/gen/models"
)

func (f *Factory) NewUserSlice(count int, opts ...UserOpt) models.UserSlice {
	slice := make(models.UserSlice, 0, count)
	for range count {
		slice = append(slice, f.NewUser(opts...))
	}

	return slice
}

type UserOpt func(event *models.UserSetter)

func (f *Factory) NewUser(opts ...UserOpt) *models.User {
	m := &models.UserSetter{
		FirstName: omit.From(f.Faker.FirstName()),
		LastName:  omit.From(f.Faker.LastName()),
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.AuthID.IsUnset() {
		m.AuthID = omit.From(f.NewAuth().ID)
	}

	ctx := context.Background()
	// Upsert so a fixed ID can be reused across a test without a unique violation.
	user, err := models.Users.Insert(m, im.OnConflict(models.Users.Columns.ID.Name()).
		DoUpdate(im.SetExcluded(m.SetColumns()...)),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to insert user: %w", err))
	}

	auth, err := models.Auths.Query(
		models.SelectWhere.Auths.ID.EQ(user.AuthID),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to retrieve auth: %w", err))
	}
	user.R.Auth = auth
	user.R.Loaded.Auth = true

	return user
}

func UserID(id string) UserOpt {
	return func(m *models.UserSetter) {
		m.ID = omit.From(id)
	}
}

func UserAuthID(authID string) UserOpt {
	return func(m *models.UserSetter) {
		m.AuthID = omit.From(authID)
	}
}

func UserLastName(lastName string) UserOpt {
	return func(m *models.UserSetter) {
		m.LastName = omit.From(lastName)
	}
}

func UserFirstName(firstName string) UserOpt {
	return func(m *models.UserSetter) {
		m.FirstName = omit.From(firstName)
	}
}
