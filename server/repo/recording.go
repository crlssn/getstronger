package repo

import (
	"context"
	"fmt"

	"github.com/gofrs/uuid/v5"
	"golang.org/x/sync/errgroup"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/training"
)

// Recordings are written under one prefix, so a bucket that grows other
// documents keeps them apart.
const recordingKeyPrefix = "recordings/"

// How many recordings of a page are read at once. A feed page is mostly
// sessions with no recording, and each one that has it is a round trip.
const recordingFetchLimit = 8

// RecordingKey names the object a workout's recording is written to.
func RecordingKey(workoutID uuid.UUID) string {
	return recordingKeyPrefix + workoutID.String() + ".json"
}

// Recording is a recording already in the object store: the workout id it was
// written under, and the key the row carries. The zero value is a workout
// logged by hand, which has no recording and needs no object.
type Recording struct {
	WorkoutID uuid.UUID
	Key       string
}

// PutRecording writes a recording before the workout that owns it exists. The
// document goes first on purpose: a failed upload then costs a retry rather
// than a session, because nothing has reached the database yet. A save that
// fails after this leaves the object behind unreferenced, which is cheaper
// than a row pointing at a document nobody wrote.
func (r *Repo) PutRecording(ctx context.Context, raw string) (Recording, error) {
	if raw == "" {
		return Recording{}, nil
	}

	workoutID, err := uuid.NewV4()
	if err != nil {
		return Recording{}, fmt.Errorf("recording workout id: %w", err)
	}

	key := RecordingKey(workoutID)
	if err = r.recordings.Put(ctx, key, []byte(raw)); err != nil {
		return Recording{}, fmt.Errorf("recording put: %w", err)
	}

	return Recording{WorkoutID: workoutID, Key: key}, nil
}

// fillRecording reads a workout's recording back out of the object store. The
// key stays on the row and never reaches the entity: where a recording is kept
// is this package's business, and a workout carries the document either way. A
// row written before recordings moved carries the document itself and is
// already filled in.
func (r *Repo) fillRecording(ctx context.Context, row *models.Workout, workout *training.Workout) error {
	if row.RecordingKey == "" {
		return nil
	}

	body, err := r.recordings.Get(ctx, row.RecordingKey)
	if err != nil {
		return fmt.Errorf("recording fetch: %w", err)
	}
	workout.RecordingJSON = string(body)

	return nil
}

// fillRecordings does the same for a page of workouts, a few at a time.
func (r *Repo) fillRecordings(ctx context.Context, rows models.WorkoutSlice, workouts []*training.Workout) error {
	group, ctx := errgroup.WithContext(ctx)
	group.SetLimit(recordingFetchLimit)

	for i, row := range rows {
		group.Go(func() error {
			return r.fillRecording(ctx, row, workouts[i])
		})
	}

	return group.Wait() //nolint:wrapcheck // fillRecording has already named the operation.
}
