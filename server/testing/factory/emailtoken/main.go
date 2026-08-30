// Command emailtoken prints the email verification token of a local account.
// Browser end-to-end tests run against the noop email provider, so this is how
// they follow the verification link a real inbox would have received.
package main

import (
	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/testing/factory/authtoken"
)

func main() {
	authtoken.Run(
		"the address to print the verification token of",
		func(auth *models.Auth) string { return auth.EmailToken.String() },
	)
}
