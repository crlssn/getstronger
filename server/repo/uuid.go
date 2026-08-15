package repo

import (
	"github.com/aarondl/opt/omitnull"
	"github.com/gofrs/uuid/v5"
)

func uuidFromString(value string) uuid.UUID {
	return uuid.FromStringOrNil(value)
}

func uuidsFromStrings(values []string) []uuid.UUID {
	ids := make([]uuid.UUID, len(values))
	for i, value := range values {
		ids[i] = uuidFromString(value)
	}

	return ids
}

func nullUUIDFromString(value string) omitnull.Val[uuid.UUID] {
	if value == "" {
		var result omitnull.Val[uuid.UUID]
		result.Null()
		return result
	}

	return omitnull.From(uuidFromString(value))
}
