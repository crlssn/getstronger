package repo

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/crlssn/getstronger/apps/backend/pkg/orm"
)

type ModelItem interface {
	*orm.Workout | *orm.Exercise | *orm.User | *orm.Routine
}

type ModelSlice[T any] interface {
	~[]T
}

type Pagination[Item ModelItem, Slice ModelSlice[Item]] struct {
	Items         Slice
	NextPageToken []byte
}

func PaginateSlice[Item ModelItem, Slice ModelSlice[Item]](
	items Slice,
	limit int,
	timestamp func(Item) time.Time,
) (*Pagination[Item, Slice], error) {
	if len(items) <= limit {
		return &Pagination[Item, Slice]{
			Items:         items,
			NextPageToken: nil,
		}, nil
	}

	items = items[:limit]
	token := PageToken{
		CreatedAt: timestamp(items[len(items)-1]),
	}

	nextPageToken, err := json.Marshal(token)
	if err != nil {
		return nil, errors.New("failed to marshal page token")
	}

	return &Pagination[Item, Slice]{
		Items:         items,
		NextPageToken: nextPageToken,
	}, nil
}
