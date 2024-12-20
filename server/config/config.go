package config

import (
	"os"
	"strings"
)

func New() *Config {
	return &Config{
		DB: DB{
			Host:     os.Getenv("DB_HOST"),
			Port:     os.Getenv("DB_PORT"),
			Name:     os.Getenv("DB_NAME"),
			User:     os.Getenv("DB_USER"),
			Password: os.Getenv("DB_PASSWORD"),
		},
		JWT: JWT{
			AccessTokenKey:  os.Getenv("JWT_ACCESS_TOKEN_KEY"),
			RefreshTokenKey: os.Getenv("JWT_REFRESH_TOKEN_KEY"),
		},
		Server: Server{
			Port:           os.Getenv("SERVER_PORT"),
			KeyPath:        os.Getenv("SERVER_KEY_PATH"),
			CertPath:       os.Getenv("SERVER_CERT_PATH"),
			CookieDomain:   os.Getenv("COOKIE_DOMAIN"),
			AllowedOrigins: strings.Split(os.Getenv("CORS_ALLOWED_ORIGIN"), ","),
		},
		Environment: os.Getenv("ENV"),
	}
}

type Config struct {
	DB          DB
	Environment string
	JWT         JWT
	Server      Server
}

type DB struct {
	Host     string
	Port     string
	Name     string
	User     string
	Password string
}

type JWT struct {
	AccessTokenKey  string
	RefreshTokenKey string
}

type Server struct {
	Port           string
	KeyPath        string
	CertPath       string
	CookieDomain   string
	AllowedOrigins []string
}
