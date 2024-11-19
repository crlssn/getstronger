package repo

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/crlssn/getstronger/apps/backend/pkg/orm"
)

type ModelItem interface {
	*orm.Workout | *orm.Exercise | *orm.User | *orm.Routine
}

type ModelSlice[T any] interface {
	~[]T
}

type PaginateParams[Item ModelItem, Slice ModelSlice[Item]] struct {
	Items     Slice
	Limit     int
	Timestamp func(Item) time.Time
}

type Pagination[Item ModelItem, Slice ModelSlice[Item]] struct {
	Items         Slice
	NextPageToken []byte
}

func PaginateSlice[Item ModelItem, Slice ModelSlice[Item]](
	p PaginateParams[Item, Slice],
) (*Pagination[Item, Slice], error) {
	if len(p.Items) <= p.Limit {
		return &Pagination[Item, Slice]{
			Items:         p.Items,
			NextPageToken: nil,
		}, nil
	}

	p.Items = p.Items[:p.Limit]
	token := PageToken{
		CreatedAt: p.Timestamp(p.Items[len(p.Items)-1]),
	}

	nextPageToken, err := json.Marshal(token)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal page token: %w", err)
	}

	return &Pagination[Item, Slice]{
		Items:         p.Items,
		NextPageToken: nextPageToken,
	}, nil
}
