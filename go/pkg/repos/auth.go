package repos

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/crlssn/getstronger/go/pkg/orm"
	"github.com/volatiletech/sqlboiler/v4/boil"
	"golang.org/x/crypto/bcrypt"
)

type Auth struct {
	db *sql.DB
}

func NewAuth(db *sql.DB) *Auth {
	return &Auth{db}
}

var ErrAuthEmailExists = fmt.Errorf("email already exists")

func (a *Auth) Insert(ctx context.Context, email, password string) error {
	exists, err := orm.Auths(orm.AuthWhere.Email.EQ(email)).Exists(ctx, a.db)
	if err != nil {
		return fmt.Errorf("email exists check: %w", err)
	}
	if exists {
		return ErrAuthEmailExists
	}

	bcryptPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("bcrypt password generation: %w", err)
	}

	if err = (&orm.Auth{
		Email:    email,
		Password: bcryptPassword,
	}).Insert(ctx, a.db, boil.Infer()); err != nil {
		return fmt.Errorf("auth insert: %w", err)
	}

	return nil
}

func (a *Auth) CompareEmailAndPassword(ctx context.Context, email, password string) error {
	auth, err := orm.Auths(orm.AuthWhere.Email.EQ(email)).One(ctx, a.db)
	if err != nil {
		return fmt.Errorf("auth fetch: %w", err)
	}

	if err = bcrypt.CompareHashAndPassword(auth.Password, []byte(password)); err != nil {
		return fmt.Errorf("hash and password comparision: %w", err)
	}

	return nil
}
