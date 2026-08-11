package repo

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/crlssn/getstronger/server/gen/models"
)

type TrainingPlan struct {
	ID              string
	UserID          string
	Name            string
	Active          bool
	CurrentPosition int
	CreatedAt       time.Time
	UpdatedAt       time.Time
	Routines        models.RoutineSlice
}

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

var (
	ErrPlanRoutineBelongsToAnotherUser = errors.New("plan routine does not belong to user")
	ErrPlanRoutineDeleted              = errors.New("plan routine is deleted")
	ErrPlanRoutineDuplicate            = errors.New("plan routine is duplicated")
	ErrPlanRequiresRoutine             = errors.New("plan requires at least one routine")
	ErrPlanNotActive                   = errors.New("plan is not active")
	ErrPlanUnexpectedRoutine           = errors.New("workout routine is not next in plan")
)

func (r *repo) validatePlanRoutines(ctx context.Context, userID string, routineIDs []string) error {
	seen := make(map[string]struct{}, len(routineIDs))
	for _, routineID := range routineIDs {
		if _, duplicate := seen[routineID]; duplicate {
			return ErrPlanRoutineDuplicate
		}
		seen[routineID] = struct{}{}

		routine, err := r.GetRoutine(ctx, GetRoutineWithID(routineID))
		if err != nil {
			return fmt.Errorf("plan routine fetch: %w", err)
		}
		if routine.UserID != userID {
			return ErrPlanRoutineBelongsToAnotherUser
		}
		if !routine.DeletedAt.IsNull() {
			return ErrPlanRoutineDeleted
		}
	}

	return nil
}

func (r *repo) replacePlanRoutines(ctx context.Context, planID string, routineIDs []string) error {
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

func (r *repo) CreatePlan(ctx context.Context, p CreatePlanParams) (*TrainingPlan, error) {
	if len(p.RoutineIDs) == 0 {
		return nil, ErrPlanRequiresRoutine
	}

	var planID string
	if err := r.NewTx(ctx, func(tx Tx) error {
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

func (r *repo) scanPlan(ctx context.Context, row interface{ Scan(dest ...any) error }) (*TrainingPlan, error) {
	plan, err := scanPlanBase(row)
	if err != nil {
		return nil, err
	}
	if err = r.loadPlanRoutines(ctx, plan); err != nil {
		return nil, err
	}

	return plan, nil
}

func scanPlanBase(row interface{ Scan(dest ...any) error }) (*TrainingPlan, error) {
	plan := &TrainingPlan{}
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

func (r *repo) loadPlanRoutines(ctx context.Context, plan *TrainingPlan) error {
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

func (r *repo) GetPlan(ctx context.Context, planID, userID string) (*TrainingPlan, error) {
	return r.scanPlan(ctx, r.sqlExec().QueryRowContext(ctx,
		selectPlanColumns+` WHERE id = $1 AND user_id = $2`, planID, userID))
}

func (r *repo) GetActivePlan(ctx context.Context, userID string) (*TrainingPlan, error) {
	return r.scanPlan(ctx, r.sqlExec().QueryRowContext(ctx,
		selectPlanColumns+` WHERE user_id = $1 AND active = TRUE`, userID))
}

func (r *repo) ListPlans(ctx context.Context, userID string) ([]*TrainingPlan, error) {
	rows, err := r.sqlExec().QueryContext(ctx,
		selectPlanColumns+` WHERE user_id = $1 ORDER BY active DESC, created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("plans query: %w", err)
	}
	defer rows.Close()

	var plans []*TrainingPlan
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

func (r *repo) UpdatePlan(ctx context.Context, p UpdatePlanParams) (*TrainingPlan, error) {
	if len(p.RoutineIDs) == 0 {
		return nil, ErrPlanRequiresRoutine
	}

	if err := r.NewTx(ctx, func(tx Tx) error {
		plan, err := tx.GetPlan(ctx, p.ID, p.UserID)
		if err != nil {
			return fmt.Errorf("plan get before update: %w", err)
		}
		if err = tx.validatePlanRoutines(ctx, p.UserID, p.RoutineIDs); err != nil {
			return err
		}

		currentRoutineID := ""
		if plan.CurrentPosition >= 0 && plan.CurrentPosition < len(plan.Routines) {
			currentRoutineID = plan.Routines[plan.CurrentPosition].ID
		}
		currentPosition := 0
		for position, routineID := range p.RoutineIDs {
			if routineID == currentRoutineID {
				currentPosition = position
				break
			}
		}

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

func (r *repo) DeletePlan(ctx context.Context, planID, userID string) error {
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

func (r *repo) SetActivePlan(ctx context.Context, planID, userID string) (*TrainingPlan, error) {
	if err := r.NewTx(ctx, func(tx Tx) error {
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

func (r *repo) PauseActivePlan(ctx context.Context, userID string) error {
	if _, err := r.sqlExec().ExecContext(ctx,
		`UPDATE public.plans SET active = FALSE, updated_at = (NOW() AT TIME ZONE 'UTC') WHERE user_id = $1 AND active = TRUE`, userID); err != nil {
		return fmt.Errorf("active plan pause: %w", err)
	}
	return nil
}

func (r *repo) AdvancePlan(ctx context.Context, planID, userID, expectedRoutineID string) (*TrainingPlan, error) {
	if err := r.NewTx(ctx, func(tx Tx) error {
		plan, err := tx.GetPlan(ctx, planID, userID)
		if err != nil {
			return fmt.Errorf("plan get before advance: %w", err)
		}
		if !plan.Active {
			return ErrPlanNotActive
		}
		if len(plan.Routines) == 0 || plan.CurrentPosition >= len(plan.Routines) {
			return ErrPlanUnexpectedRoutine
		}
		if expectedRoutineID != "" && plan.Routines[plan.CurrentPosition].ID != expectedRoutineID {
			return ErrPlanUnexpectedRoutine
		}

		nextPosition := (plan.CurrentPosition + 1) % len(plan.Routines)
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
