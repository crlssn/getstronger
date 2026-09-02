package repo

import (
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/gofrs/uuid/v5"

	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/dialect"
	"github.com/stephenafamo/bob/dialect/psql/um"
	"golang.org/x/crypto/bcrypt"

	"github.com/crlssn/getstronger/server/gen/models"
)

type ModelItem interface {
	*models.Workout | *models.Exercise | *models.Routine | *models.Set | *models.WorkoutComment |
		*models.Notification | *models.Auth | *models.User
}

type ModelSlice[T any] interface {
	~[]T
}

type Pagination[Item ModelItem, Slice ModelSlice[Item]] struct {
	Items         Slice
	NextPageToken []byte
}

func PaginateSlice[Item ModelItem, Slice ModelSlice[Item]](
	items Slice, limit int, cursor func(Item) (createdAt time.Time, id uuid.UUID),
) (*Pagination[Item, Slice], error) {
	return PaginateSliceWithToken(items, limit, func(item Item) any {
		createdAt, id := cursor(item)
		token := PageTokenCreatedAt(createdAt)
		token.ID = id
		return token
	})
}

// PaginateSliceWithToken trims the page and mints the token from its last item.
// Lists ordered by anything other than creation time supply their own cursor.
func PaginateSliceWithToken[Item ModelItem, Slice ModelSlice[Item]](
	items Slice, limit int, token func(Item) any,
) (*Pagination[Item, Slice], error) {
	if len(items) <= limit {
		return &Pagination[Item, Slice]{
			Items:         items,
			NextPageToken: nil,
		}, nil
	}

	items = items[:limit]
	nextPageToken, err := json.Marshal(token(items[len(items)-1]))
	if err != nil {
		return nil, fmt.Errorf("marshal page token: %w", err)
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
	// ID pins the cursor to one row: created_at alone is not unique — every set
	// of a workout shares one — and a cursor naming several rows loses whichever
	// of them sort after it. Nil in tokens minted before it existed, which keep
	// their strictly-older meaning.
	ID uuid.UUID `json:"id,omitempty"`
}

// The Update* methods built on these opts each issue a single statement keyed
// by primary key. A single statement is atomic on its own and the predicate
// limits the row count to 0 or 1, so none of them opens a transaction: there
// would be nothing for the row-count guard to roll back. They run through
// bobExec, which still joins an enclosing transaction when there is one.
type updateOpt interface {
	UpdateRoutineOpt | UpdateAuthOpt | UpdateExerciseOpt | UpdateWorkoutOpt | UpdateUserOpt
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
		return nil, fmt.Errorf("hash password: %w", err)
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
