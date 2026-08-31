package v1

import (
	"context"
	"database/sql"
	"errors"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/xcontext"
)

// planRotation is the slice of the store that keeps an athlete's plans and the
// position each one has reached.
type planRotation interface {
	CreatePlan(ctx context.Context, p repo.CreatePlanParams) (*training.Plan, error)
	GetPlan(ctx context.Context, planID, userID string) (*training.Plan, error)
	ListPlans(ctx context.Context, userID string) ([]*training.Plan, error)
	UpdatePlan(ctx context.Context, p repo.UpdatePlanParams) (*training.Plan, error)
	DeletePlan(ctx context.Context, planID, userID string) error
	SetActivePlan(ctx context.Context, planID, userID string) (*training.Plan, error)
	PauseActivePlan(ctx context.Context, userID string) error
	AdvancePlan(ctx context.Context, planID, userID, expectedRoutineID string) (*training.Plan, error)
}

// planLibrary answers for the plans an athlete follows: creating them, editing
// their rotation, and moving through it.
type planLibrary struct {
	plans planRotation
}

func (p *planLibrary) CreatePlan(ctx context.Context, req *connect.Request[apiv1.CreatePlanRequest]) (*connect.Response[apiv1.CreatePlanResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	plan, err := p.plans.CreatePlan(ctx, repo.CreatePlanParams{
		UserID:     userID,
		Name:       req.Msg.GetName(),
		RoutineIDs: req.Msg.GetRoutineIds(),
	})
	if err != nil {
		log.Error("Create plan", zap.Error(err))
		if training.RejectsRotation(err) || errors.Is(err, sql.ErrNoRows) {
			return nil, connect.NewError(connect.CodeInvalidArgument, nil)
		}
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.CreatePlanResponse{Plan: parser.Plan(plan)}), nil
}

func (p *planLibrary) GetPlan(ctx context.Context, req *connect.Request[apiv1.GetPlanRequest]) (*connect.Response[apiv1.GetPlanResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	plan, err := p.plans.GetPlan(ctx, req.Msg.GetId(), userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}
		log.Error("Get plan by ID", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.GetPlanResponse{Plan: parser.Plan(plan)}), nil
}

func (p *planLibrary) ListPlans(ctx context.Context, _ *connect.Request[apiv1.ListPlansRequest]) (*connect.Response[apiv1.ListPlansResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	plans, err := p.plans.ListPlans(ctx, userID)
	if err != nil {
		log.Error("List plans", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.ListPlansResponse{Plans: parser.PlanSlice(plans)}), nil
}

func (p *planLibrary) UpdatePlan(ctx context.Context, req *connect.Request[apiv1.UpdatePlanRequest]) (*connect.Response[apiv1.UpdatePlanResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	plan, err := p.plans.UpdatePlan(ctx, repo.UpdatePlanParams{
		ID:         req.Msg.GetId(),
		UserID:     userID,
		Name:       req.Msg.GetName(),
		RoutineIDs: req.Msg.GetRoutineIds(),
	})
	if err != nil {
		log.Error("Update plan", zap.Error(err))
		if errors.Is(err, sql.ErrNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}
		if training.RejectsRotation(err) {
			return nil, connect.NewError(connect.CodeInvalidArgument, nil)
		}
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.UpdatePlanResponse{Plan: parser.Plan(plan)}), nil
}

func (p *planLibrary) DeletePlan(ctx context.Context, req *connect.Request[apiv1.DeletePlanRequest]) (*connect.Response[apiv1.DeletePlanResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := p.plans.DeletePlan(ctx, req.Msg.GetId(), userID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}
		log.Error("Delete plan", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.DeletePlanResponse{}), nil
}

func (p *planLibrary) SetActivePlan(ctx context.Context, req *connect.Request[apiv1.SetActivePlanRequest]) (*connect.Response[apiv1.SetActivePlanResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	plan, err := p.plans.SetActivePlan(ctx, req.Msg.GetId(), userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}
		// A plan whose routines have all been deleted has nothing to train, so
		// the client is asking for a state the plan cannot be in.
		if training.RejectsRotation(err) {
			log.Warn("Plan cannot be activated", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}
		log.Error("Set active plan", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.SetActivePlanResponse{Plan: parser.Plan(plan)}), nil
}

func (p *planLibrary) PauseActivePlan(ctx context.Context, _ *connect.Request[apiv1.PauseActivePlanRequest]) (*connect.Response[apiv1.PauseActivePlanResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := p.plans.PauseActivePlan(ctx, userID); err != nil {
		log.Error("Pause active plan", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.PauseActivePlanResponse{}), nil
}

func (p *planLibrary) SkipPlanRoutine(ctx context.Context, req *connect.Request[apiv1.SkipPlanRoutineRequest]) (*connect.Response[apiv1.SkipPlanRoutineResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	plan, err := p.plans.AdvancePlan(ctx, req.Msg.GetId(), userID, "")
	if err != nil {
		log.Error("Skip plan routine", zap.Error(err))
		if errors.Is(err, sql.ErrNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}
		if errors.Is(err, training.ErrPlanNotActive) || errors.Is(err, training.ErrPlanUnexpectedRoutine) {
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.SkipPlanRoutineResponse{Plan: parser.Plan(plan)}), nil
}
