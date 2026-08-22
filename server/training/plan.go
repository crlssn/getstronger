package training

import (
	"errors"
	"time"

	"github.com/gofrs/uuid/v5"

	"github.com/crlssn/getstronger/server/gen/models"
)

// Plan is a rotation of routines an athlete works through in order. Exactly one
// of an athlete's plans is active at a time, and the active plan remembers the
// position it has reached so the app can say what to train next.
type Plan struct {
	ID              string
	UserID          string
	Name            string
	Active          bool
	CurrentPosition int
	CreatedAt       time.Time
	UpdatedAt       time.Time
	Routines        models.RoutineSlice
}

var (
	ErrPlanRequiresRoutine   = errors.New("plan requires at least one routine")
	ErrPlanRoutineDuplicate  = errors.New("plan routine is duplicated")
	ErrPlanNotActive         = errors.New("plan is not active")
	ErrPlanUnexpectedRoutine = errors.New("workout routine is not next in plan")
)

// CurrentRoutine is the routine the plan expects to be trained next, or nil
// when the plan has rotated past its routines or holds none at all.
func (p *Plan) CurrentRoutine() *models.Routine {
	if p == nil || p.CurrentPosition < 0 || p.CurrentPosition >= len(p.Routines) {
		return nil
	}

	return p.Routines[p.CurrentPosition]
}

// Advance reports the position the plan rotates to once routineID has been
// trained, wrapping back to the start of the rotation. An empty routineID
// skips whichever routine is current without naming it.
func (p *Plan) Advance(routineID string) (int, error) {
	if !p.Active {
		return 0, ErrPlanNotActive
	}

	current := p.CurrentRoutine()
	if current == nil {
		return 0, ErrPlanUnexpectedRoutine
	}

	if routineID != "" && current.ID.String() != routineID {
		return 0, ErrPlanUnexpectedRoutine
	}

	return (p.CurrentPosition + 1) % len(p.Routines), nil
}

// PositionAfterReplacing is the position that keeps the plan pointing at the
// routine it is on once its rotation is replaced by routineIDs. A rotation that
// drops the current routine starts again from the beginning.
func (p *Plan) PositionAfterReplacing(routineIDs []string) int {
	current := p.CurrentRoutine()
	if current == nil {
		return 0
	}

	for position, routineID := range routineIDs {
		if routineID == current.ID.String() {
			return position
		}
	}

	return 0
}

// ValidatePlanRotation checks a requested rotation on its own terms: a plan
// needs at least one routine and may not train the same one twice per cycle.
// Whether each routine exists and belongs to the athlete is a separate question
// that only the store can answer.
func ValidatePlanRotation(routineIDs []string) error {
	if len(routineIDs) == 0 {
		return ErrPlanRequiresRoutine
	}

	seen := make(map[string]struct{}, len(routineIDs))
	for _, routineID := range routineIDs {
		if _, duplicate := seen[routineID]; duplicate {
			return ErrPlanRoutineDuplicate
		}
		seen[routineID] = struct{}{}
	}

	return nil
}

var (
	ErrPlanRoutineBelongsToAnotherUser = errors.New("plan routine does not belong to user")
	ErrPlanRoutineDeleted              = errors.New("plan routine is deleted")
)

// ValidatePlanRoutine checks that a routine may take part in an athlete's
// rotation: they must own it, and a deleted routine cannot be trained.
func ValidatePlanRoutine(routine *models.Routine, userID string) error {
	if routine.UserID != uuid.FromStringOrNil(userID) {
		return ErrPlanRoutineBelongsToAnotherUser
	}

	if !routine.DeletedAt.IsNull() {
		return ErrPlanRoutineDeleted
	}

	return nil
}
