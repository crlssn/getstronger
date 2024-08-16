package main

import (
	"connectrpc.com/connect"
	"context"
	v1 "github.com/crlssn/getstronger/go/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/go/pkg/pb/api/v1/apiv1connect"
	"go.uber.org/fx"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"log"
	"net/http"
)

const address = "localhost:8080"

func main() {
	fx.New(options()...).Run()
}

func options() []fx.Option {
	return []fx.Option{
		fx.Provide(
			http.NewServeMux,
		),
		fx.Invoke(
			func(mux *http.ServeMux) error {
				mux.Handle(apiv1connect.NewAuthServiceHandler(&petStoreServiceServer{}))
				return http.ListenAndServe(address, h2c.NewHandler(mux, &http2.Server{}))
			},
		),
	}
}

var _ apiv1connect.AuthServiceHandler = (*petStoreServiceServer)(nil)

type petStoreServiceServer struct{}

func (s *petStoreServiceServer) Signup(ctx context.Context, req *connect.Request[v1.SignupRequest]) (*connect.Response[v1.SignupResponse], error) {
	name := req.Msg.GetEmail()
	petType := req.Msg.GetPassword()
	log.Printf("Got a request to create a %v named %s", petType, name)
	return connect.NewResponse(&v1.SignupResponse{}), nil
}
