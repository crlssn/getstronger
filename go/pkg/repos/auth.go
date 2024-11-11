package repos

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/volatiletech/null/v8"
	"github.com/volatiletech/sqlboiler/v4/boil"
	"golang.org/x/crypto/bcrypt"

	"github.com/crlssn/getstronger/go/pkg/orm"
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

func (a *Auth) FromEmail(ctx context.Context, email string) (*orm.Auth, error) {
	return orm.Auths(orm.AuthWhere.Email.EQ(email)).One(ctx, a.db)
}

func (a *Auth) UpdateRefreshToken(ctx context.Context, authID string, refreshToken string) error {
	auth := &orm.Auth{ID: authID, RefreshToken: null.StringFrom(refreshToken)}
	_, err := auth.Update(ctx, a.db, boil.Whitelist(orm.AuthColumns.RefreshToken))
	return err
}

func (a *Auth) DeleteRefreshToken(ctx context.Context, refreshToken string) error {
	_, err := orm.Auths(orm.AuthWhere.RefreshToken.EQ(null.StringFrom(refreshToken))).UpdateAll(ctx, a.db, orm.M{orm.AuthColumns.RefreshToken: nil})
	return err
}
