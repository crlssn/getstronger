package v1

import (
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/repo"
)

var _ apiv1connect.RoutineServiceHandler = (*routineService)(nil)

// routineService is the RPC surface the app calls to plan its training. It
// holds no logic of its own: the three responsibilities behind it — editing
// routines, following a plan, and assembling the dashboard — answer for
// themselves, and this type only puts them behind one service.
type routineService struct {
	*routineLibrary
	*planLibrary
	*dashboard
}

func NewRoutineHandler(r *repo.Repo) apiv1connect.RoutineServiceHandler {
	return &routineService{
		routineLibrary: &routineLibrary{repo: r},
		planLibrary:    &planLibrary{plans: r},
		dashboard:      &dashboard{sources: r},
	}
}
