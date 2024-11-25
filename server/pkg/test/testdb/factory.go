//nolint:all
package testdb

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/brianvoe/gofakeit/v7"
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
