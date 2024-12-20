package db

import (
	"database/sql"
	"fmt"
	"net"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver

	"github.com/crlssn/getstronger/server/config"
)

func New(c *config.Config) (*sql.DB, error) {
	db, err := sql.Open("pgx", ConnectionString(c))
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	return db, nil
}

func ConnectionString(c *config.Config) string {
	sslMode := ""
	if c.Env == "development" {
		sslMode = "?sslmode=disable"
	}

	return fmt.Sprintf("postgresql://%s:%s@%s/%s%s", c.DB.User, c.DB.Password, net.JoinHostPort(c.DB.Host, c.DB.Port), c.DB.Name, sslMode)
}
