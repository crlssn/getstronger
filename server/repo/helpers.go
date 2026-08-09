package repo

import (
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/dialect"
	"github.com/stephenafamo/bob/dialect/psql/um"
	"golang.org/x/crypto/bcrypt"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/gen/orm"
)

type ModelItem interface {
	*orm.Workout | *orm.Exercise | *orm.Routine | *orm.Set | *orm.WorkoutComment | *orm.Notification |
		*models.Auth | *models.User
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
	nextPageToken, err := json.Marshal(PageTokenCreatedAt(createdAt(items[len(items)-1])))
	if err != nil {
		return nil, fmt.Errorf("failed to marshal page token: %w", err)
	}

	return &Pagination[Item, Slice]{
		Items:         items,
		NextPageToken: nextPageToken,
	}, nil
}

func PageTokenCreatedAt(t time.Time) PageToken {
	return PageToken{
		// Truncate to microseconds to unify precision across different databases.
		CreatedAt: t.Truncate(time.Microsecond),
	}
}

type PageToken struct {
	CreatedAt time.Time `json:"createdAt"`
}

type updateOpt interface {
	UpdateRoutineOpt | UpdateAuthOpt | UpdateExerciseOpt | UpdateWorkoutOpt
}

var (
	ErrUpdateNoColumns       = fmt.Errorf("update opt: no columns")
	ErrUpdateRowsAffected    = fmt.Errorf("update opt: rows affected")
	ErrUpdateDuplicateColumn = fmt.Errorf("update opt: duplicate column")
)

// columns is the set of column/value pairs an update opt contributes. A nil
// value clears the column.
type columns map[string]any

// updateMods renders the columns as Bob SET clauses, sorted by column name so
// the generated SQL is stable rather than dependent on map iteration order.
func (c columns) updateMods() []bob.Mod[*dialect.UpdateQuery] {
	names := make([]string, 0, len(c))
	for name := range c {
		names = append(names, name)
	}
	sort.Strings(names)

	mods := make([]bob.Mod[*dialect.UpdateQuery], 0, len(names))
	for _, name := range names {
		mods = append(mods, um.SetCol(name).ToArg(c[name]))
	}

	return mods
}

func updateColumnsFromOpts[T updateOpt](opts []T) (columns, error) {
	if len(opts) == 0 {
		return nil, ErrUpdateNoColumns
	}

	cols := make(columns, len(opts))
	for _, opt := range opts {
		column, err := opt()
		if err != nil {
			return nil, fmt.Errorf("update opt: %w", err)
		}

		for key, value := range column {
			if _, ok := cols[key]; ok {
				return nil, fmt.Errorf("%w: %s", ErrUpdateDuplicateColumn, key)
			}

			cols[key] = value
		}
	}

	return cols, nil
}

func hashPassword(password string) ([]byte, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	return hash, nil
}

func MustHashPassword(password string) []byte {
	hash, err := hashPassword(password)
	if err != nil {
		panic(err)
	}

	return hash
}
