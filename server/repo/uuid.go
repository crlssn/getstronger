package repo

import (
	"github.com/aarondl/opt/omit"
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

// omitUUID leaves a primary key to the database's own default where the caller
// named no id, and sets it where the caller has already committed to one.
func omitUUID(value uuid.UUID) omit.Val[uuid.UUID] {
	if value.IsNil() {
		var result omit.Val[uuid.UUID]
		return result
	}

	return omit.From(value)
}
