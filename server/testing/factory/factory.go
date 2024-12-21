//nolint:all
package factory

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/brianvoe/gofakeit/v7"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/gen/orm"
)

type Factory struct {
	db    *sql.DB
	faker *gofakeit.Faker
	debug bool
}

func NewFactory(db *sql.DB) *Factory {
	return &Factory{
		db:    db,
		faker: gofakeit.New(0),
		debug: false,
	}
}

type Reload interface {
	Reload(context.Context, boil.ContextExecutor) error
}

func (f *Factory) Reload(r Reload) {
	if err := r.Reload(context.Background(), f.db); err != nil {
		panic(fmt.Errorf("failed to reload: %w", err))
	}
}

func (f *Factory) SetUser(
	user func(ctx context.Context, exec boil.ContextExecutor) (*orm.User, error),
	setUser func(ctx context.Context, exec boil.ContextExecutor, insert bool, related *orm.User) error,
) {
	u, err := user(context.Background(), f.db)
	if err != nil {
		panic(fmt.Errorf("failed to retrieve user: %w", err))
	}

	if err = setUser(context.Background(), f.db, false, u); err != nil {
		panic(fmt.Errorf("failed to set user: %w", err))
	}
}

// UUID generates a UUID populated exclusively by the given digit which can be useful during debugging.
func UUID(digit int) string {
	if digit < 0 || digit > 9 {
		panic("digit must be between 0 and 9")
	}

	digitStr := fmt.Sprintf("%d", digit)
	return strings.Join([]string{
		strings.Repeat(digitStr, 8),
		strings.Repeat(digitStr, 4),
		strings.Repeat(digitStr, 4),
		strings.Repeat(digitStr, 4),
		strings.Repeat(digitStr, 12),
	}, "-")
}
