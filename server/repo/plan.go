package repo

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/lib/pq"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/training"
)

type CreatePlanParams struct {
	UserID     string
	Name       string
	RoutineIDs []string
}

type UpdatePlanParams struct {
	ID         string
	UserID     string
	Name       string
	RoutineIDs []string
}

// validatePlanRoutines answers the half of the rotation rules that needs the
// database: whether each routine exists and may be trained by this athlete.
func (r *Repo) validatePlanRoutines(ctx context.Context, userID string, routineIDs []string) error {
	if err := training.ValidatePlanRotation(routineIDs); err != nil {
		return fmt.Errorf("plan rotation validate: %w", err)
	}

	routines, err := r.ListRoutines(ctx, ListRoutinesWithIDs(routineIDs))
	if err != nil {
		return fmt.Errorf("plan routines fetch: %w", err)
	}

	routinesByID := make(map[string]*models.Routine, len(routines))
	for _, routine := range routines {
		routinesByID[routine.ID.String()] = routine
	}

	// Walking the requested order rather than the rows keeps two rejections the
	// handlers answer with different codes apart: a routine no row matches does
	// not exist, one whose row names another athlete is not the caller's.
	for _, routineID := range routineIDs {
		routine, found := routinesByID[routineID]
		if !found {
			return fmt.Errorf("plan routine fetch: %w", sql.ErrNoRows)
		}

		if err = training.ValidatePlanRoutine(routine, userID); err != nil {
			return fmt.Errorf("plan routine validate: %w", err)
		}
	}

	return nil
}

func (r *Repo) replacePlanRoutines(ctx context.Context, planID string, routineIDs []string) error {
	if _, err := r.sqlExec().ExecContext(ctx, `DELETE FROM public.plan_routines WHERE plan_id = $1`, planID); err != nil {
		return fmt.Errorf("plan routines delete: %w", err)
	}

	for position, routineID := range routineIDs {
		if _, err := r.sqlExec().ExecContext(ctx, `
INSERT INTO public.plan_routines (plan_id, routine_id, position)
VALUES ($1, $2, $3)`, planID, routineID, position); err != nil {
			return fmt.Errorf("plan routine insert: %w", err)
		}
	}

	return nil
}

// dropRoutineFromPlans takes routine out of every plan that trains it, letting
// training.Plan say where each rotation now points. plan_routines.position is
// rewritten rather than left with a gap because plans.current_position indexes
// the dense slice loadPlanRoutines builds.
//
// Reading the athlete's plans costs no more than reading only the ones holding
// the routine: ListPlans loads every rotation in the same two queries. It must
// run before the routine is retired, while its rows still resolve.
func (r *Repo) dropRoutineFromPlans(ctx context.Context, routine *models.Routine) error {
	userID := routine.UserID.String()
	plans, err := r.ListPlans(ctx, userID)
	if err != nil {
		return fmt.Errorf("plans before routine removal: %w", err)
	}

	for _, plan := range plans {
		rotation := plan.RotationWithout(routine.ID.String())
		if len(rotation.RoutineIDs) == len(plan.Routines) {
			continue
		}

		if _, err = r.exec().ExecContext(ctx, `
UPDATE public.plans
SET current_position = $1, active = $2, updated_at = (NOW() AT TIME ZONE 'UTC')
WHERE id = $3 AND user_id = $4`, rotation.CurrentPosition, rotation.Active, plan.ID, userID); err != nil {
			return fmt.Errorf("plan rotation update: %w", err)
		}

		if err = r.replacePlanRoutines(ctx, plan.ID, rotation.RoutineIDs); err != nil {
			return err
		}
	}

	return nil
}

func (r *Repo) CreatePlan(ctx context.Context, p CreatePlanParams) (*training.Plan, error) {
	var planID string
	if err := r.NewTx(ctx, func(tx *Repo) error {
		if err := tx.validatePlanRoutines(ctx, p.UserID, p.RoutineIDs); err != nil {
			return err
		}

		planID = uuid.NewString()
		if _, err := tx.exec().ExecContext(ctx, `
INSERT INTO public.plans (id, user_id, name)
VALUES ($1, $2, $3)`, planID, p.UserID, p.Name); err != nil {
			return fmt.Errorf("plan insert: %w", err)
		}

		return tx.replacePlanRoutines(ctx, planID, p.RoutineIDs)
	}); err != nil {
		return nil, fmt.Errorf("plan create transaction: %w", err)
	}

	return r.GetPlan(ctx, planID, p.UserID)
}

func (r *Repo) scanPlan(ctx context.Context, row interface{ Scan(dest ...any) error }) (*training.Plan, error) {
	plan, err := scanPlanBase(row)
	if err != nil {
		return nil, err
	}
	if err = r.loadPlanRoutines(ctx, []*training.Plan{plan}); err != nil {
		return nil, err
	}

	return plan, nil
}

func scanPlanBase(row interface{ Scan(dest ...any) error }) (*training.Plan, error) {
	plan := &training.Plan{}
	if err := row.Scan(
		&plan.ID,
		&plan.UserID,
		&plan.Name,
		&plan.Active,
		&plan.CurrentPosition,
		&plan.CreatedAt,
		&plan.UpdatedAt,
	); err != nil {
		return nil, fmt.Errorf("plan scan: %w", err)
	}
	return plan, nil
}

// loadPlanRoutines fills in the rotation each plan trains, costing one read of
// the rotations and one of the routines they name however many plans and
// routines are involved. Every plan must belong to the same athlete, which
// every read in this file does.
func (r *Repo) loadPlanRoutines(ctx context.Context, plans []*training.Plan) error {
	if len(plans) == 0 {
		return nil
	}

	planIDs := make([]string, 0, len(plans))
	for _, plan := range plans {
		planIDs = append(planIDs, plan.ID)
	}

	rotations, err := r.planRotations(ctx, planIDs)
	if err != nil {
		return err
	}

	var routineIDs []string
	for _, planID := range planIDs {
		routineIDs = append(routineIDs, rotations[planID]...)
	}
	if len(routineIDs) == 0 {
		return nil
	}

	routines, err := r.ListRoutines(
		ctx,
		ListRoutinesWithIDs(routineIDs),
		ListRoutinesWithUserID(plans[0].UserID),
		ListRoutinesLoadExercises(),
	)
	if err != nil {
		return fmt.Errorf("plan routines fetch: %w", err)
	}

	for _, plan := range plans {
		rotation := rotations[plan.ID]
		plan.Routines = training.OrderRoutinesByIDs(routines, rotation)
		// A routine missing from the athlete's own routines leaves a hole in the
		// rotation. Fetching one at a time reported that as not found, and the
		// handlers still answer for it that way.
		if len(plan.Routines) != len(rotation) {
			return fmt.Errorf("plan routine fetch: %w", sql.ErrNoRows)
		}
	}

	return nil
}

// planRotations reads which routines each plan trains and in what order.
func (r *Repo) planRotations(ctx context.Context, planIDs []string) (map[string][]string, error) {
	rows, err := r.sqlExec().QueryContext(ctx, `
SELECT plan_id, routine_id
FROM public.plan_routines
WHERE plan_id = ANY($1)
ORDER BY plan_id, position`, pq.Array(planIDs))
	if err != nil {
		return nil, fmt.Errorf("plan routines query: %w", err)
	}
	defer rows.Close()

	rotations := make(map[string][]string, len(planIDs))
	for rows.Next() {
		var planID, routineID string
		if err = rows.Scan(&planID, &routineID); err != nil {
			return nil, fmt.Errorf("plan routine scan: %w", err)
		}
		rotations[planID] = append(rotations[planID], routineID)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("plan routines iterate: %w", err)
	}
	if err = rows.Close(); err != nil {
		return nil, fmt.Errorf("plan routines close: %w", err)
	}

	return rotations, nil
}

const selectPlanColumns = `
SELECT id, user_id, name, active, current_position, created_at, updated_at
FROM public.plans`

func (r *Repo) GetPlan(ctx context.Context, planID, userID string) (*training.Plan, error) {
	return r.scanPlan(ctx, r.sqlExec().QueryRowContext(ctx,
		selectPlanColumns+` WHERE id = $1 AND user_id = $2`, planID, userID))
}

func (r *Repo) GetActivePlan(ctx context.Context, userID string) (*training.Plan, error) {
	return r.scanPlan(ctx, r.sqlExec().QueryRowContext(ctx,
		selectPlanColumns+` WHERE user_id = $1 AND active = TRUE`, userID))
}

func (r *Repo) ListPlans(ctx context.Context, userID string) ([]*training.Plan, error) {
	rows, err := r.sqlExec().QueryContext(ctx,
		selectPlanColumns+` WHERE user_id = $1 ORDER BY active DESC, created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("plans query: %w", err)
	}
	defer rows.Close()

	var plans []*training.Plan
	for rows.Next() {
		plan, scanErr := scanPlanBase(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		plans = append(plans, plan)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("plans iterate: %w", err)
	}
	if err = rows.Close(); err != nil {
		return nil, fmt.Errorf("plans close: %w", err)
	}

	if err = r.loadPlanRoutines(ctx, plans); err != nil {
		return nil, err
	}

	return plans, nil
}

func (r *Repo) UpdatePlan(ctx context.Context, p UpdatePlanParams) (*training.Plan, error) {
	if err := r.NewTx(ctx, func(tx *Repo) error {
		plan, err := tx.GetPlan(ctx, p.ID, p.UserID)
		if err != nil {
			return fmt.Errorf("plan get before update: %w", err)
		}
		if err = tx.validatePlanRoutines(ctx, p.UserID, p.RoutineIDs); err != nil {
			return err
		}

		currentPosition := plan.PositionAfterReplacing(p.RoutineIDs)

		if _, err = tx.exec().ExecContext(ctx, `
UPDATE public.plans
SET name = $1, current_position = $2, updated_at = (NOW() AT TIME ZONE 'UTC')
WHERE id = $3 AND user_id = $4`, p.Name, currentPosition, p.ID, p.UserID); err != nil {
			return fmt.Errorf("plan update: %w", err)
		}

		return tx.replacePlanRoutines(ctx, p.ID, p.RoutineIDs)
	}); err != nil {
		return nil, fmt.Errorf("plan update transaction: %w", err)
	}

	return r.GetPlan(ctx, p.ID, p.UserID)
}

func (r *Repo) DeletePlan(ctx context.Context, planID, userID string) error {
	result, err := r.sqlExec().ExecContext(ctx,
		`DELETE FROM public.plans WHERE id = $1 AND user_id = $2`, planID, userID)
	if err != nil {
		return fmt.Errorf("plan delete: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("plan delete rows: %w", err)
	}
	if rows != 1 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *Repo) SetActivePlan(ctx context.Context, planID, userID string) (*training.Plan, error) {
	if err := r.NewTx(ctx, func(tx *Repo) error {
		plan, err := tx.GetPlan(ctx, planID, userID)
		if err != nil {
			return fmt.Errorf("plan get before activation: %w", err)
		}
		if err = plan.ValidateActivation(); err != nil {
			return fmt.Errorf("plan activation validate: %w", err)
		}
		if _, err := tx.exec().ExecContext(ctx,
			`UPDATE public.plans SET active = FALSE, updated_at = (NOW() AT TIME ZONE 'UTC') WHERE user_id = $1 AND active = TRUE`, userID); err != nil {
			return fmt.Errorf("active plan pause: %w", err)
		}
		if _, err := tx.exec().ExecContext(ctx,
			`UPDATE public.plans SET active = TRUE, updated_at = (NOW() AT TIME ZONE 'UTC') WHERE id = $1 AND user_id = $2`, planID, userID); err != nil {
			return fmt.Errorf("active plan set: %w", err)
		}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("active plan transaction: %w", err)
	}

	return r.GetPlan(ctx, planID, userID)
}

func (r *Repo) PauseActivePlan(ctx context.Context, userID string) error {
	if _, err := r.sqlExec().ExecContext(ctx,
		`UPDATE public.plans SET active = FALSE, updated_at = (NOW() AT TIME ZONE 'UTC') WHERE user_id = $1 AND active = TRUE`, userID); err != nil {
		return fmt.Errorf("active plan pause: %w", err)
	}
	return nil
}

func (r *Repo) AdvancePlan(ctx context.Context, planID, userID, expectedRoutineID string) (*training.Plan, error) {
	if err := r.NewTx(ctx, func(tx *Repo) error {
		plan, err := tx.GetPlan(ctx, planID, userID)
		if err != nil {
			return fmt.Errorf("plan get before advance: %w", err)
		}
		nextPosition, err := plan.Advance(expectedRoutineID)
		if err != nil {
			return fmt.Errorf("plan next position: %w", err)
		}

		if _, err = tx.exec().ExecContext(ctx, `
UPDATE public.plans
SET current_position = $1, updated_at = (NOW() AT TIME ZONE 'UTC')
WHERE id = $2 AND user_id = $3 AND active = TRUE`, nextPosition, planID, userID); err != nil {
			return fmt.Errorf("plan advance: %w", err)
		}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("plan advance transaction: %w", err)
	}

	return r.GetPlan(ctx, planID, userID)
}
