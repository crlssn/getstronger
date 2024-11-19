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

func PaginateSlice[S ModelSlice](
	items S,
	limit int,
	timestamp func(S) time.Time,
) (S, []byte, error) {
	if len(items) <= limit {
		return items, nil, nil
	}

	items = items[:limit]
	token := PageToken{
		CreatedAt: timestamp(items[len(items)-1]),
	}

	nextPageToken, err := json.Marshal(token)
	if err != nil {
		return nil, nil, errors.New("failed to marshal page token")
	}

	return items, nextPageToken, nil
}
