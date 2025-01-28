package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/gen/orm"
)

func (f *Factory) NewUserSlice(count int, opts ...UserOpt) orm.UserSlice {
	var slice orm.UserSlice
	for range count {
		slice = append(slice, f.NewUser(opts...))
	}

	return slice
}

type UserOpt func(event *orm.User)

func (f *Factory) NewUser(opts ...UserOpt) *orm.User {
	m := &orm.User{
		AuthID:    "",
		FirstName: f.Faker.FirstName(),
		LastName:  f.Faker.LastName(),
		CreatedAt: time.Time{},
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.AuthID == "" {
		m.AuthID = f.NewAuth().ID
	}

	insertColumns := boil.Infer()
	updateColumns := boil.Infer()
	conflictColumns := []string{orm.UserColumns.ID}
	if err := m.Upsert(context.Background(), f.db, true, conflictColumns, updateColumns, insertColumns); err != nil {
		panic(fmt.Errorf("failed to insert user: %w", err))
	}

	auth, err := m.Auth().One(context.Background(), f.db)
	if err != nil {
		panic(fmt.Errorf("failed to retrieve auth: %w", err))
	}

	if err = m.SetAuth(context.Background(), f.db, false, auth); err != nil {
		panic(fmt.Errorf("failed to set auth: %w", err))
	}

	return m
}

func UserID(id string) UserOpt {
	return func(m *orm.User) {
		m.ID = id
	}
}

func UserAuthID(authID string) UserOpt {
	return func(m *orm.User) {
		m.AuthID = authID
	}
}

func UserLastName(lastName string) UserOpt {
	return func(m *orm.User) {
		m.LastName = lastName
	}
}

func UserFirstName(firstName string) UserOpt {
	return func(m *orm.User) {
		m.FirstName = firstName
	}
}
