package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/crlssn/getstronger/go/pkg/orm"
	"github.com/volatiletech/sqlboiler/v4/boil"
	"golang.org/x/crypto/bcrypt"
	"strings"
)

type Auth struct {
	db *sql.DB
}

func NewAuth(db *sql.DB) *Auth {
	return &Auth{db}
}

var ErrAuthEmailExists = fmt.Errorf("email already exists")

func (a *Auth) Insert(ctx context.Context, email, password string) error {
	email = strings.ReplaceAll(email, " ", "")
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
