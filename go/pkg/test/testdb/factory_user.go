package testdb

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/go/pkg/orm"
)

type UserOpt func(event *orm.User)

func (f *Factory) NewUser(opts ...UserOpt) *orm.User {
	m := &orm.User{
		ID:        uuid.NewString(),
		FirstName: "",
		LastName:  "",
		CreatedAt: time.Time{},
	}

	// Auth is a prerequisite for a User.
	f.NewAuth(AuthID(m.ID))

	for _, opt := range opts {
		opt(m)
	}

	if err := m.Insert(f.ctx, f.db, boil.Infer()); err != nil {
		panic(fmt.Errorf("failed to insert user: %w", err))
	}

	return m
}

func UserID(id string) UserOpt {
	return func(m *orm.User) {
		m.ID = id
	}
}
