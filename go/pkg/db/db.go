package db

import (
	"database/sql"
	"fmt"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type Options struct {
	Host     string
	Port     string
	User     string
	Password string
	Database string
}

func New(opts Options) (*sql.DB, error) {
	println(fmt.Sprintf("postgresql://%s:%s@%s:%s/%s", opts.User, opts.Password, opts.Host, opts.Port, opts.Database))
	return sql.Open("pgx", fmt.Sprintf("postgresql://%s:%s@%s:%s/%s", opts.User, opts.Password, opts.Host, opts.Port, opts.Database))
}

func MustNewTest() *sql.DB {
	db, err := New(Options{
		Host:     "localhost",
		Port:     "5433",
		User:     "root",
		Password: "root",
		Database: "postgres",
	})
	if err != nil {
		panic(err)
	}
	return db
}
