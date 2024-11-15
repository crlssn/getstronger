package db

import (
	"database/sql"
	"fmt"
	"net"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
)

type Options struct {
	Host     string
	Port     string
	User     string
	Password string
	Database string
}

func New(opts Options) (*sql.DB, error) {
	db, err := sql.Open("pgx", fmt.Sprintf("postgresql://%s:%s@%s/%s", opts.User, opts.Password, net.JoinHostPort(opts.Host, opts.Port), opts.Database))
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	return db, nil
}
