package parser

import (
	"errors"
	"fmt"

	"github.com/gofrs/uuid/v5"
)

// ErrNotAUUID reports a request field that names a row with something that is
// not a row id.
//
// Every such field is constrained to a UUID in the schema and the validation
// interceptor runs before any handler, so no request can produce it: it answers
// for a field the schema forgot to constrain. Handlers turn it into the invalid
// argument it is.
var ErrNotAUUID = errors.New("not a uuid")

// UUID reads a row id off a request field.
func UUID(value string) (uuid.UUID, error) {
	id, err := uuid.FromString(value)
	if err != nil {
		return uuid.Nil, fmt.Errorf("%w: %q", ErrNotAUUID, value)
	}

	return id, nil
}

// UUIDs reads a repeated row id field. One value that is not a row id fails the
// whole field: a partial list would silently drop whatever it named.
func UUIDs(values []string) ([]uuid.UUID, error) {
	ids := make([]uuid.UUID, 0, len(values))
	for _, value := range values {
		id, err := UUID(value)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}

	return ids, nil
}

// OptionalUUID reads a field that may say nothing. An empty one names no row
// and answers with the nil UUID, which is how the store stores an absent
// reference and how the rules read one.
func OptionalUUID(value string) (uuid.UUID, error) {
	if value == "" {
		return uuid.Nil, nil
	}

	return UUID(value)
}
