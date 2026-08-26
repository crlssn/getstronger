package config

import (
	"net"
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
			Provider:          EmailProvider(os.Getenv("EMAIL_PROVIDER")),
			FromAddress:       os.Getenv("EMAIL_FROM_ADDRESS"),
			SMTPHost:          os.Getenv("MAILHOG_SMTP_HOST"),
			SMTPPort:          os.Getenv("MAILHOG_SMTP_PORT"),
			ScalewayProjectID: os.Getenv("SCW_PROJECT_ID"),
			ScalewayRegion:    os.Getenv("SCW_TEM_REGION"),
			ScalewaySecretKey: os.Getenv("SCW_TEM_SECRET_KEY"),
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

const (
	EnvironmentLocal      Environment = "local"
	EnvironmentBeta       Environment = "beta"
	EnvironmentProduction Environment = "production"
)

// Seedable reports whether the environment's data may be truncated and replaced
// by the seed tooling. Beta is a demo environment reseeded on every deploy;
// production holds real accounts and never qualifies.
func (e Environment) Seedable() bool {
	return e == EnvironmentLocal || e == EnvironmentBeta
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

func (s Server) HasCertificate() bool {
	return s.KeyPath != "" && s.CertPath != ""
}

type Email struct {
	Provider          EmailProvider
	FromAddress       string
	SMTPHost          string
	SMTPPort          string
	ScalewayProjectID string
	ScalewayRegion    string
	ScalewaySecretKey string
}

// Where MailHog listens when nothing overrides it. Worktrees publish it on
// their own port, which 'mise run worktree:env' writes to .env.
const (
	defaultSMTPHost = "localhost"
	defaultSMTPPort = "1025"
)

// SMTPAddr is the address the local email provider delivers to.
func (e Email) SMTPAddr() string {
	host, port := e.SMTPHostPort()
	return net.JoinHostPort(host, port)
}

// SMTPHostPort resolves the configured SMTP host and port, falling back to the
// defaults when either is unset.
func (e Email) SMTPHostPort() (string, string) {
	host := e.SMTPHost
	if host == "" {
		host = defaultSMTPHost
	}

	port := e.SMTPPort
	if port == "" {
		port = defaultSMTPPort
	}

	return host, port
}

type EmailProvider string

const (
	EmailProviderScaleway EmailProvider = "scaleway"
	EmailProviderNoop     EmailProvider = "noop"
	EmailProviderLocal    EmailProvider = "local"
)
