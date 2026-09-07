package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"
)

// Serverless SQL documents a ceiling of 1,000 connections, but only at its
// maximum of 15 vCPU: the number scales with allocated vCPU, and an active
// database scales back down to 1. The budget to divide is therefore nearer
// 1000/15 — about 66 — than 1,000. The API container's maximum instance count
// is kept low (README.md), so eight instances holding eight connections each
// stays under that floor with room for the migration job and a psql session.
// https://www.scaleway.com/en/docs/serverless-sql-databases/reference-content/serverless-sql-databases-overview/
const (
	defaultMaxOpenConns = 8
	defaultMaxIdleConns = 8
)

// The same page idles a database after five minutes without a query. A
// connection held past that is one the pooler may already have dropped, so it
// is retired on a schedule rather than found dead on a request.
const defaultConnMaxLifetime = 5 * time.Minute

var (
	errPositivePool  = errors.New("connection counts and lifetime must be positive")
	errIdleAboveOpen = errors.New("idle connections may not exceed open connections")
)

// DBPool bounds one instance's share of the database's connection budget.
// Instances autoscale, so a pool left unbounded lets them exhaust the pooler
// between them at the moment traffic is highest.
type DBPool struct {
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

// NewDBPool refuses invalid overrides instead of silently restoring the
// unbounded default.
func NewDBPool() (*DBPool, error) {
	p := &DBPool{MaxOpenConns: defaultMaxOpenConns, MaxIdleConns: defaultMaxIdleConns, ConnMaxLifetime: defaultConnMaxLifetime}
	for name, value := range map[string]*int{
		"DB_MAX_OPEN_CONNS": &p.MaxOpenConns,
		"DB_MAX_IDLE_CONNS": &p.MaxIdleConns,
	} {
		if raw := os.Getenv(name); raw != "" {
			n, err := strconv.Atoi(raw)
			if err != nil {
				return nil, fmt.Errorf("parse %s: %w", name, err)
			}
			if n <= 0 {
				return nil, fmt.Errorf("%s: %w", name, errPositivePool)
			}
			*value = n
		}
	}
	if raw := os.Getenv("DB_CONN_MAX_LIFETIME"); raw != "" {
		d, err := time.ParseDuration(raw)
		if err != nil {
			return nil, fmt.Errorf("parse DB_CONN_MAX_LIFETIME: %w", err)
		}
		if d <= 0 {
			return nil, fmt.Errorf("DB_CONN_MAX_LIFETIME: %w", errPositivePool)
		}
		p.ConnMaxLifetime = d
	}
	if p.MaxIdleConns > p.MaxOpenConns {
		return nil, fmt.Errorf("DB_MAX_IDLE_CONNS: %w", errIdleAboveOpen)
	}
	return p, nil
}
