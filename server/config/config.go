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
		ObjectStore: ObjectStore{
			Provider:  ObjectStoreProvider(os.Getenv("OBJECT_STORE_PROVIDER")),
			Endpoint:  os.Getenv("OBJECT_STORE_ENDPOINT"),
			Region:    os.Getenv("OBJECT_STORE_REGION"),
			Bucket:    os.Getenv("OBJECT_STORE_BUCKET"),
			AccessKey: os.Getenv("OBJECT_STORE_ACCESS_KEY"),
			SecretKey: os.Getenv("OBJECT_STORE_SECRET_KEY"),
			Path:      os.Getenv("OBJECT_STORE_PATH"),
		},
		Pprof: Pprof{
			Token: os.Getenv("PPROF_TOKEN"),
		},
		Logs: Logs{
			Token:    os.Getenv("POSTHOG_KEY"),
			Endpoint: os.Getenv("POSTHOG_LOGS_ENDPOINT"),
		},
		Environment: Environment(os.Getenv("ENV")),
	}
}

type Config struct {
	DB          DB
	JWT         JWT
	Email       Email
	Server      Server
	ObjectStore ObjectStore
	Pprof       Pprof
	Logs        Logs
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

// Local reports whether this is a developer's own stack. Every deployed
// environment is served over TLS, so environment branches treat anything
// non-local — an unknown value included — as deployed and fail closed.
func (e Environment) Local() bool {
	return e == EnvironmentLocal
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

// Pprof configures the runtime profiling endpoints. The token is both the
// switch and the credential: there is no way to serve the profiles without
// also setting the secret that guards them.
type Pprof struct {
	Token string
}

// PprofTokenMinLength is 128 bits written as hex — what `openssl rand -hex 16`
// produces. The profiles behind the token carry the server's stack traces, and
// reading one is expensive enough to be a denial of service on its own, so a
// token short enough to guess is worse than none.
const PprofTokenMinLength = 32

// Enabled reports whether the profiling endpoints may be served. Only a token
// long enough to be worth having counts, so an environment that sets nothing —
// every one of them until somebody deliberately does — serves no profiles.
func (p Pprof) Enabled() bool {
	return len(p.Token) >= PprofTokenMinLength
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

// ObjectStore says where the documents that are too big to keep on a row are
// written. Endpoint, region and bucket name one S3-compatible bucket; Path is
// the directory the filesystem provider writes under instead.
type ObjectStore struct {
	Provider  ObjectStoreProvider
	Endpoint  string
	Region    string
	Bucket    string
	AccessKey string
	SecretKey string
	Path      string
}

type ObjectStoreProvider string

const (
	ObjectStoreProviderS3         ObjectStoreProvider = "s3"
	ObjectStoreProviderFilesystem ObjectStoreProvider = "filesystem"
)

// DefaultObjectStorePath is where the filesystem provider writes when nothing
// says otherwise: a directory beside the checkout, which Git ignores.
const DefaultObjectStorePath = ".objectstore"

// Root is the directory the filesystem provider writes under.
func (o ObjectStore) Root() string {
	if o.Path == "" {
		return DefaultObjectStorePath
	}

	return o.Path
}
