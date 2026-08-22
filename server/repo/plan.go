package repo

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"

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

	for _, routineID := range routineIDs {
		routine, err := r.GetRoutine(ctx, GetRoutineWithID(routineID))
		if err != nil {
			return fmt.Errorf("plan routine fetch: %w", err)
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
	if err = r.loadPlanRoutines(ctx, plan); err != nil {
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

func (r *Repo) loadPlanRoutines(ctx context.Context, plan *training.Plan) error {
	routineRows, err := r.sqlExec().QueryContext(ctx, `
SELECT routine_id
FROM public.plan_routines
WHERE plan_id = $1
ORDER BY position`, plan.ID)
	if err != nil {
		return fmt.Errorf("plan routines query: %w", err)
	}
	defer routineRows.Close()

	var routineIDs []string
	for routineRows.Next() {
		var routineID string
		if err = routineRows.Scan(&routineID); err != nil {
			return fmt.Errorf("plan routine scan: %w", err)
		}
		routineIDs = append(routineIDs, routineID)
	}
	if err = routineRows.Err(); err != nil {
		return fmt.Errorf("plan routines iterate: %w", err)
	}
	if err = routineRows.Close(); err != nil {
		return fmt.Errorf("plan routines close: %w", err)
	}

	for _, routineID := range routineIDs {
		routine, routineErr := r.GetRoutine(
			ctx,
			GetRoutineWithID(routineID),
			GetRoutineWithUserID(plan.UserID),
			GetRoutineWithExercises(),
		)
		if routineErr != nil {
			return fmt.Errorf("plan routine fetch: %w", routineErr)
		}
		plan.Routines = append(plan.Routines, routine)
	}

	return nil
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

	for _, plan := range plans {
		if err = r.loadPlanRoutines(ctx, plan); err != nil {
			return nil, err
		}
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
		if _, err := tx.GetPlan(ctx, planID, userID); err != nil {
			return fmt.Errorf("plan get before activation: %w", err)
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
