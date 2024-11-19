package repo

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/crlssn/getstronger/apps/backend/pkg/orm"
)

type ModelSlice interface {
	orm.WorkoutSlice | orm.ExerciseSlice | orm.UserSlice | orm.RoutineSlice
}

type Pagination[T ModelSlice] struct {
	Items         T
	NextPageToken []byte
}

func PaginateSlice[S ModelSlice](
	items S,
	limit int,
	timestamp func(S) time.Time,
) (*Pagination[S], error) {
	if len(items) <= limit {
		return &Pagination[S]{
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

	return &Pagination[S]{
		Items:         items,
		NextPageToken: nextPageToken,
	}, nil
}
