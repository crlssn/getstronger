package db

import (
	"database/sql"
	"fmt"
	"net"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver

	"github.com/crlssn/getstronger/server/config"
)

// New opens the pool and bounds it. sql.Open does not dial, so the limits are
// in place before the first connection is made.
func New(c *config.Config, pool *config.DBPool) (*sql.DB, error) {
	db, err := sql.Open("pgx", connection(c))
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	db.SetMaxOpenConns(pool.MaxOpenConns)
	db.SetMaxIdleConns(pool.MaxIdleConns)
	db.SetConnMaxLifetime(pool.ConnMaxLifetime)
	return db, nil
}

func connection(c *config.Config) string {
	sslMode := "?sslmode=require"
	if c.Environment.Local() {
		sslMode = "?sslmode=disable"
	}

	return fmt.Sprintf("postgresql://%s:%s@%s/%s%s", c.DB.User, c.DB.Password, net.JoinHostPort(c.DB.Host, c.DB.Port), c.DB.Name, sslMode)
}
