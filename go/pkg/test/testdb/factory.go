package testdb

import (
	"context"
	"database/sql"
)

type Factory struct {
	ctx context.Context
	db  *sql.DB
}

func NewFactory(ctx context.Context, db *sql.DB) *Factory {
	return &Factory{ctx, db}
}
