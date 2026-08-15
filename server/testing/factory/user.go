package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/stephenafamo/bob/dialect/psql/im"

	bobfactory "github.com/crlssn/getstronger/server/gen/factory"
	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/weightunit"
)

func (f *Factory) NewUserSlice(count int, opts ...UserOpt) models.UserSlice {
	slice := make(models.UserSlice, 0, count)
	for range count {
		slice = append(slice, f.NewUser(opts...))
	}

	return slice
}

type UserOpt func(user *models.UserSetter)

func (f *Factory) NewUser(opts ...UserOpt) *models.User {
	setter := &models.UserSetter{
		FirstName: omit.From(f.Faker.FirstName()),
		LastName:  omit.From(f.Faker.LastName()),
	}
	for _, opt := range opts {
		opt(setter)
	}

	ctx := context.Background()
	var auth *models.Auth
	if authID, ok := setter.AuthID.Get(); ok {
		var err error
		auth, err = models.Auths.Query(models.SelectWhere.Auths.ID.EQ(authID)).One(ctx, f.exec)
		if err != nil {
			panic(fmt.Errorf("failed to retrieve auth: %w", err))
		}
	} else {
		auth = f.NewAuth()
	}

	mods := []bobfactory.UserMod{
		bobfactory.UserMods.WithExistingAuth(authWithoutRelationships(auth)),
		bobfactory.UserMods.WeightUnit(string(weightunit.Kilograms)),
	}
	if value, ok := setter.ID.Get(); ok {
		mods = append(mods, bobfactory.UserMods.ID(value))
	}
	if value, ok := setter.FirstName.Get(); ok {
		mods = append(mods, bobfactory.UserMods.FirstName(value))
	}
	if value, ok := setter.LastName.Get(); ok {
		mods = append(mods, bobfactory.UserMods.LastName(value))
	}
	if value, ok := setter.CreatedAt.Get(); ok {
		mods = append(mods, bobfactory.UserMods.CreatedAt(value))
	}
	if value, ok := setter.WeightUnit.Get(); ok {
		mods = append(mods, bobfactory.UserMods.WeightUnit(value))
	}

	template := f.generated.NewUser(mods...)
	built := template.Build()
	setter = template.BuildSetter()
	setter.AuthID = omit.From(built.AuthID)
	user, err := models.Users.Insert(
		setter,
		im.OnConflict(models.Users.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(setter.SetColumns()...)),
	).One(ctx, f.exec)
	if err != nil {
		panic(fmt.Errorf("failed to create user with Bob factory: %w", err))
	}
	user.R = built.R

	return user
}

func UserID(id any) UserOpt {
	return func(m *models.UserSetter) {
		m.ID = omit.From(nativeUUID(id))
	}
}

func UserAuthID(authID any) UserOpt {
	return func(m *models.UserSetter) {
		m.AuthID = omit.From(nativeUUID(authID))
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

func UserCreatedAt(createdAt time.Time) UserOpt {
	return func(m *models.UserSetter) {
		m.CreatedAt = omit.From(createdAt)
	}
}

func UserWeightUnit(unit weightunit.Unit) UserOpt {
	return func(m *models.UserSetter) {
		m.WeightUnit = omit.From(string(unit))
	}
}
