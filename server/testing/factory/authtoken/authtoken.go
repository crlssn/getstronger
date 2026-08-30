// Package authtoken backs the commands that print a local account's tokens.
// Browser end-to-end tests run against the noop email provider, so this is how
// they follow a link a real inbox would have received.
//
// The two commands differ only in the token they read, so the account lookup
// and the guards around it live here rather than once per command.
package authtoken

import (
	"context"
	"flag"
	"fmt"
	"log"

	"github.com/joho/godotenv"
	"github.com/stephenafamo/bob"

	"github.com/crlssn/getstronger/server/account"
	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/db"
	"github.com/crlssn/getstronger/server/gen/models"
)

// FindAuth resolves the account holding an already-normalized address.
type FindAuth func(ctx context.Context, email string) (*models.Auth, error)

// Auth resolves the account registered to rawEmail.
//
// The address is normalized first: signup folds it to lowercase before storing
// it, so a command handed one typed any other way would match no row.
func Auth(ctx context.Context, find FindAuth, rawEmail string) (*models.Auth, error) {
	return find(ctx, account.NormalizeEmailAddress(rawEmail))
}

// Run is the body of a command printing one token of the account named by
// -email, whose usage line describes the token it prints. The token is the
// command's only output, so nothing else may be written to stdout.
func Run(usage string, token func(*models.Auth) string) {
	if err := godotenv.Load(); err != nil {
		panic(fmt.Errorf("load .env file: %w", err))
	}

	c := config.New()
	if c.Environment != config.EnvironmentLocal {
		log.Printf("environment must be local, got %s", c.Environment)
		return
	}

	email := flag.String("email", "", usage)
	flag.Parse()

	if *email == "" {
		log.Print("an email is required")
		return
	}

	database, err := db.New(c)
	if err != nil {
		log.Printf("connect to database: %v", err)
		return
	}

	find := func(ctx context.Context, address string) (*models.Auth, error) {
		return models.Auths.Query(
			models.SelectWhere.Auths.Email.EQ(address),
		).One(ctx, bob.NewDB(database))
	}

	auth, err := Auth(context.Background(), find, *email)
	if err != nil {
		log.Printf("fetch auth: %v", err)
		return
	}

	fmt.Println(token(auth)) //nolint:forbidigo // The token is this command's output.
}
