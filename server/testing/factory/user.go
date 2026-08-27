package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/stephenafamo/bob/dialect/psql/im"

	"github.com/crlssn/getstronger/server/distanceunit"
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
		Name:     omit.From(f.Faker.Name()),
		Username: omit.From(f.nextUsername()),
	}
	for _, opt := range opts {
		opt(setter)
	}

	ctx := context.Background()
	var auth *models.Auth
	if authID, ok := setter.AuthID.Get(); ok {
		auth = f.mustAuth(authID)
	} else {
		auth = f.NewAuth()
	}

	mods := append([]bobfactory.UserMod{
		bobfactory.UserMods.WithExistingAuth(authWithoutRelationships(auth)),
		bobfactory.UserMods.WeightUnit(string(weightunit.Kilograms)),
		bobfactory.UserMods.DistanceUnit(string(distanceunit.Kilometers)),
	}, userSetterMods(setter)...)

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
		panic(fmt.Errorf("create user with Bob factory: %w", err))
	}
	user.R = built.R
	f.remember(user.ID, user)

	return user
}

// userSetterMods translates the values set through UserOpts into factory mods
// so they override the defaults above.
func userSetterMods(setter *models.UserSetter) []bobfactory.UserMod {
	const modCount = 7
	mods := make([]bobfactory.UserMod, 0, modCount)
	if value, ok := setter.ID.Get(); ok {
		mods = append(mods, bobfactory.UserMods.ID(value))
	}
	if value, ok := setter.Name.Get(); ok {
		mods = append(mods, bobfactory.UserMods.Name(value))
	}
	if value, ok := setter.Username.Get(); ok {
		mods = append(mods, bobfactory.UserMods.Username(value))
	}
	if value, ok := setter.CreatedAt.Get(); ok {
		mods = append(mods, bobfactory.UserMods.CreatedAt(value))
	}
	if value, ok := setter.WeightUnit.Get(); ok {
		mods = append(mods, bobfactory.UserMods.WeightUnit(value))
	}
	if value, ok := setter.DistanceUnit.Get(); ok {
		mods = append(mods, bobfactory.UserMods.DistanceUnit(value))
	}
	if value, ok := setter.AutofillSets.Get(); ok {
		mods = append(mods, bobfactory.UserMods.AutofillSets(value))
	}

	return mods
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

func UserName(name string) UserOpt {
	return func(m *models.UserSetter) {
		m.Name = omit.From(name)
	}
}

func UserUsername(username string) UserOpt {
	return func(m *models.UserSetter) {
		m.Username = omit.From(username)
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

func UserDistanceUnit(unit distanceunit.Unit) UserOpt {
	return func(m *models.UserSetter) {
		m.DistanceUnit = omit.From(string(unit))
	}
}

func UserAutofillSets(enabled bool) UserOpt {
	return func(m *models.UserSetter) {
		m.AutofillSets = omit.From(enabled)
	}
}
