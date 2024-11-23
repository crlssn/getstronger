package repo

import (
	"encoding/json"
	"fmt"
	"time"

	orm2 "github.com/crlssn/getstronger/server/pkg/orm"
)

type ModelItem interface {
	*orm2.Workout | *orm2.Exercise | *orm2.User | *orm2.Routine
}

type ModelSlice[T any] interface {
	~[]T
}

type Pagination[Item ModelItem, Slice ModelSlice[Item]] struct {
	Items         Slice
	NextPageToken []byte
}

func PaginateSlice[Item ModelItem, Slice ModelSlice[Item]](
	items Slice, limit int, createdAt func(Item) time.Time,
) (*Pagination[Item, Slice], error) {
	if len(items) <= limit {
		return &Pagination[Item, Slice]{
			Items:         items,
			NextPageToken: nil,
		}, nil
	}

	items = items[:limit]
	nextPageToken, err := json.Marshal(PageToken{
		CreatedAt: createdAt(items[len(items)-1]),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal page token: %w", err)
	}

	return &Pagination[Item, Slice]{
		Items:         items,
		NextPageToken: nextPageToken,
	}, nil
}
