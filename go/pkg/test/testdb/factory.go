package testdb

import (
	"database/sql"
)

type Factory struct {
	db *sql.DB
}

func NewFactory(db *sql.DB) *Factory {
	return &Factory{db}
}
