package testdb

import (
	"database/sql"

	"github.com/brianvoe/gofakeit/v7"
)

type Factory struct {
	db    *sql.DB
	faker *gofakeit.Faker
}

func NewFactory(db *sql.DB) *Factory {
	return &Factory{
		db:    db,
		faker: gofakeit.New(0),
	}
}
