package v1_test

import "github.com/gofrs/uuid/v5"

func nativeUUID(value string) uuid.UUID {
	return uuid.FromStringOrNil(value)
}
