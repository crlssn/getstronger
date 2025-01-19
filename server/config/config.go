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
		Email: Email{
			Provider: EmailProvider(os.Getenv("EMAIL_PROVIDER")),
		},
		Server: Server{
			Port:           os.Getenv("SERVER_PORT"),
			KeyPath:        os.Getenv("SERVER_KEY_PATH"),
			CertPath:       os.Getenv("SERVER_CERT_PATH"),
			CookieDomain:   os.Getenv("COOKIE_DOMAIN"),
			AllowedOrigins: strings.Split(os.Getenv("CORS_ALLOWED_ORIGIN"), ","),
		},
		Environment: Environment(os.Getenv("ENV")),
	}
}

type Config struct {
	DB          DB
	JWT         JWT
	Email       Email
	Server      Server
	Environment Environment
}

type Environment string

const EnvironmentLocal = "local"

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

func (s Server) HasCertificate() bool {
	return s.KeyPath != "" && s.CertPath != ""
}

type Email struct {
	Provider EmailProvider
}

type EmailProvider string

const (
	EmailProviderSES   EmailProvider = "ses"
	EmailProviderNoop  EmailProvider = "noop"
	EmailProviderLocal EmailProvider = "local"
)
