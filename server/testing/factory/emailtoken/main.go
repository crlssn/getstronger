// Command emailtoken prints the email verification token of a local account.
// Browser end-to-end tests run against the noop email provider, so this is how
// they follow the verification link a real inbox would have received.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"

	"github.com/joho/godotenv"
	"github.com/stephenafamo/bob"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/db"
	"github.com/crlssn/getstronger/server/gen/models"
)

func main() {
	if err := godotenv.Load(); err != nil {
		panic(fmt.Errorf("load .env file: %w", err))
	}

	c := config.New()
	if c.Environment != config.EnvironmentLocal {
		log.Printf("environment must be local, got %s", c.Environment)
		return
	}

	email := flag.String("email", "", "the address to print the verification token of")
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

	auth, err := models.Auths.Query(
		models.SelectWhere.Auths.Email.EQ(*email),
	).One(context.Background(), bob.NewDB(database))
	if err != nil {
		log.Printf("fetch auth: %v", err)
		return
	}

	fmt.Println(auth.EmailToken.String()) //nolint:forbidigo // The token is this command's output.
}
