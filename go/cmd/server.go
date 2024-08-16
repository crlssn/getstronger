package main

import (
	"connectrpc.com/connect"
	"context"
	"fmt"
	v1 "github.com/crlssn/getstronger/go/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/go/pkg/pb/api/v1/apiv1connect"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"log"
	"net/http"
)

const address = "localhost:8080"

func main() {
	mux := http.NewServeMux()
	path, handler := apiv1connect.NewAuthServiceHandler(&petStoreServiceServer{})
	mux.Handle(path, handler)
	fmt.Println("... Listening on", address, path)
	if err := http.ListenAndServe(
		address,
		// Use h2c so we can serve HTTP/2 without TLS.
		h2c.NewHandler(mux, &http2.Server{}),
	); err != nil {
		log.Fatalf("Failed to serve: %v", err)
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
