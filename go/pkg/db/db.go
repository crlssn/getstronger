package db

import (
	"database/sql"
	"fmt"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type Options struct {
	Host     string
	Port     int
	User     string
	Password string
	Database string
}

func New(opts Options) (*sql.DB, error) {
	return sql.Open("pgx", fmt.Sprintf("postgresql://%s:%s@%s:%d/%s", opts.User, opts.Password, opts.Host, opts.Port, opts.Database))
}
