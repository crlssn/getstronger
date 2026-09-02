package repo

import (
	"github.com/aarondl/opt/omitnull"
	"github.com/gofrs/uuid/v5"
)

// nullUUID renders an optional reference for Bob: the nil UUID names no row, so
// it stores as NULL rather than as an id nothing has.
func nullUUID(value uuid.UUID) omitnull.Val[uuid.UUID] {
	if value.IsNil() {
		var result omitnull.Val[uuid.UUID]
		result.Null()
		return result
	}

	return omitnull.From(value)
}
