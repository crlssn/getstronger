// Code generated by protoc-gen-connect-go. DO NOT EDIT.
//
// Source: api/v1/routines.proto

package apiv1connect

import (
	context "context"
	errors "errors"
	http "net/http"
	strings "strings"

	connect "connectrpc.com/connect"
	v1 "github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1"
)

// This is a compile-time assertion to ensure that this generated file and the connect package are
// compatible. If you get a compiler error that this constant is not defined, this code was
// generated with a version of connect newer than the one compiled into your binary. You can fix the
// problem by either regenerating this code with an older version of connect or updating the connect
// version compiled into your binary.
const _ = connect.IsAtLeastVersion1_13_0

const (
	// RoutineServiceName is the fully-qualified name of the RoutineService service.
	RoutineServiceName = "api.v1.RoutineService"
)

// These constants are the fully-qualified names of the RPCs defined in this package. They're
// exposed at runtime as Spec.Procedure and as the final two segments of the HTTP route.
//
// Note that these are different from the fully-qualified method names used by
// google.golang.org/protobuf/reflect/protoreflect. To convert from these constants to
// reflection-formatted method names, remove the leading slash and convert the remaining slash to a
// period.
const (
	// RoutineServiceCreateProcedure is the fully-qualified name of the RoutineService's Create RPC.
	RoutineServiceCreateProcedure = "/api.v1.RoutineService/Create"
	// RoutineServiceGetProcedure is the fully-qualified name of the RoutineService's Get RPC.
	RoutineServiceGetProcedure = "/api.v1.RoutineService/Get"
	// RoutineServiceUpdateProcedure is the fully-qualified name of the RoutineService's Update RPC.
	RoutineServiceUpdateProcedure = "/api.v1.RoutineService/Update"
	// RoutineServiceDeleteProcedure is the fully-qualified name of the RoutineService's Delete RPC.
	RoutineServiceDeleteProcedure = "/api.v1.RoutineService/Delete"
	// RoutineServiceListProcedure is the fully-qualified name of the RoutineService's List RPC.
	RoutineServiceListProcedure = "/api.v1.RoutineService/List"
	// RoutineServiceAddExerciseProcedure is the fully-qualified name of the RoutineService's
	// AddExercise RPC.
	RoutineServiceAddExerciseProcedure = "/api.v1.RoutineService/AddExercise"
	// RoutineServiceRemoveExerciseProcedure is the fully-qualified name of the RoutineService's
	// RemoveExercise RPC.
	RoutineServiceRemoveExerciseProcedure = "/api.v1.RoutineService/RemoveExercise"
)

// These variables are the protoreflect.Descriptor objects for the RPCs defined in this package.
var (
	routineServiceServiceDescriptor              = v1.File_api_v1_routines_proto.Services().ByName("RoutineService")
	routineServiceCreateMethodDescriptor         = routineServiceServiceDescriptor.Methods().ByName("Create")
	routineServiceGetMethodDescriptor            = routineServiceServiceDescriptor.Methods().ByName("Get")
	routineServiceUpdateMethodDescriptor         = routineServiceServiceDescriptor.Methods().ByName("Update")
	routineServiceDeleteMethodDescriptor         = routineServiceServiceDescriptor.Methods().ByName("Delete")
	routineServiceListMethodDescriptor           = routineServiceServiceDescriptor.Methods().ByName("List")
	routineServiceAddExerciseMethodDescriptor    = routineServiceServiceDescriptor.Methods().ByName("AddExercise")
	routineServiceRemoveExerciseMethodDescriptor = routineServiceServiceDescriptor.Methods().ByName("RemoveExercise")
)

// RoutineServiceClient is a client for the api.v1.RoutineService service.
type RoutineServiceClient interface {
	Create(context.Context, *connect.Request[v1.CreateRoutineRequest]) (*connect.Response[v1.CreateRoutineResponse], error)
	Get(context.Context, *connect.Request[v1.GetRoutineRequest]) (*connect.Response[v1.GetRoutineResponse], error)
	Update(context.Context, *connect.Request[v1.UpdateRoutineRequest]) (*connect.Response[v1.UpdateRoutineResponse], error)
	Delete(context.Context, *connect.Request[v1.DeleteRoutineRequest]) (*connect.Response[v1.DeleteRoutineResponse], error)
	List(context.Context, *connect.Request[v1.ListRoutinesRequest]) (*connect.Response[v1.ListRoutinesResponse], error)
	AddExercise(context.Context, *connect.Request[v1.AddExerciseRequest]) (*connect.Response[v1.AddExerciseResponse], error)
	RemoveExercise(context.Context, *connect.Request[v1.RemoveExerciseRequest]) (*connect.Response[v1.RemoveExerciseResponse], error)
}

// NewRoutineServiceClient constructs a client for the api.v1.RoutineService service. By default, it
// uses the Connect protocol with the binary Protobuf Codec, asks for gzipped responses, and sends
// uncompressed requests. To use the gRPC or gRPC-Web protocols, supply the connect.WithGRPC() or
// connect.WithGRPCWeb() options.
//
// The URL supplied here should be the base URL for the Connect or gRPC server (for example,
// http://api.acme.com or https://acme.com/grpc).
func NewRoutineServiceClient(httpClient connect.HTTPClient, baseURL string, opts ...connect.ClientOption) RoutineServiceClient {
	baseURL = strings.TrimRight(baseURL, "/")
	return &routineServiceClient{
		create: connect.NewClient[v1.CreateRoutineRequest, v1.CreateRoutineResponse](
			httpClient,
			baseURL+RoutineServiceCreateProcedure,
			connect.WithSchema(routineServiceCreateMethodDescriptor),
			connect.WithClientOptions(opts...),
		),
		get: connect.NewClient[v1.GetRoutineRequest, v1.GetRoutineResponse](
			httpClient,
			baseURL+RoutineServiceGetProcedure,
			connect.WithSchema(routineServiceGetMethodDescriptor),
			connect.WithClientOptions(opts...),
		),
		update: connect.NewClient[v1.UpdateRoutineRequest, v1.UpdateRoutineResponse](
			httpClient,
			baseURL+RoutineServiceUpdateProcedure,
			connect.WithSchema(routineServiceUpdateMethodDescriptor),
			connect.WithClientOptions(opts...),
		),
		delete: connect.NewClient[v1.DeleteRoutineRequest, v1.DeleteRoutineResponse](
			httpClient,
			baseURL+RoutineServiceDeleteProcedure,
			connect.WithSchema(routineServiceDeleteMethodDescriptor),
			connect.WithClientOptions(opts...),
		),
		list: connect.NewClient[v1.ListRoutinesRequest, v1.ListRoutinesResponse](
			httpClient,
			baseURL+RoutineServiceListProcedure,
			connect.WithSchema(routineServiceListMethodDescriptor),
			connect.WithClientOptions(opts...),
		),
		addExercise: connect.NewClient[v1.AddExerciseRequest, v1.AddExerciseResponse](
			httpClient,
			baseURL+RoutineServiceAddExerciseProcedure,
			connect.WithSchema(routineServiceAddExerciseMethodDescriptor),
			connect.WithClientOptions(opts...),
		),
		removeExercise: connect.NewClient[v1.RemoveExerciseRequest, v1.RemoveExerciseResponse](
			httpClient,
			baseURL+RoutineServiceRemoveExerciseProcedure,
			connect.WithSchema(routineServiceRemoveExerciseMethodDescriptor),
			connect.WithClientOptions(opts...),
		),
	}
}

// routineServiceClient implements RoutineServiceClient.
type routineServiceClient struct {
	create         *connect.Client[v1.CreateRoutineRequest, v1.CreateRoutineResponse]
	get            *connect.Client[v1.GetRoutineRequest, v1.GetRoutineResponse]
	update         *connect.Client[v1.UpdateRoutineRequest, v1.UpdateRoutineResponse]
	delete         *connect.Client[v1.DeleteRoutineRequest, v1.DeleteRoutineResponse]
	list           *connect.Client[v1.ListRoutinesRequest, v1.ListRoutinesResponse]
	addExercise    *connect.Client[v1.AddExerciseRequest, v1.AddExerciseResponse]
	removeExercise *connect.Client[v1.RemoveExerciseRequest, v1.RemoveExerciseResponse]
}

// Create calls api.v1.RoutineService.Create.
func (c *routineServiceClient) Create(ctx context.Context, req *connect.Request[v1.CreateRoutineRequest]) (*connect.Response[v1.CreateRoutineResponse], error) {
	return c.create.CallUnary(ctx, req)
}

// Get calls api.v1.RoutineService.Get.
func (c *routineServiceClient) Get(ctx context.Context, req *connect.Request[v1.GetRoutineRequest]) (*connect.Response[v1.GetRoutineResponse], error) {
	return c.get.CallUnary(ctx, req)
}

// Update calls api.v1.RoutineService.Update.
func (c *routineServiceClient) Update(ctx context.Context, req *connect.Request[v1.UpdateRoutineRequest]) (*connect.Response[v1.UpdateRoutineResponse], error) {
	return c.update.CallUnary(ctx, req)
}

// Delete calls api.v1.RoutineService.Delete.
func (c *routineServiceClient) Delete(ctx context.Context, req *connect.Request[v1.DeleteRoutineRequest]) (*connect.Response[v1.DeleteRoutineResponse], error) {
	return c.delete.CallUnary(ctx, req)
}

// List calls api.v1.RoutineService.List.
func (c *routineServiceClient) List(ctx context.Context, req *connect.Request[v1.ListRoutinesRequest]) (*connect.Response[v1.ListRoutinesResponse], error) {
	return c.list.CallUnary(ctx, req)
}

// AddExercise calls api.v1.RoutineService.AddExercise.
func (c *routineServiceClient) AddExercise(ctx context.Context, req *connect.Request[v1.AddExerciseRequest]) (*connect.Response[v1.AddExerciseResponse], error) {
	return c.addExercise.CallUnary(ctx, req)
}

// RemoveExercise calls api.v1.RoutineService.RemoveExercise.
func (c *routineServiceClient) RemoveExercise(ctx context.Context, req *connect.Request[v1.RemoveExerciseRequest]) (*connect.Response[v1.RemoveExerciseResponse], error) {
	return c.removeExercise.CallUnary(ctx, req)
}

// RoutineServiceHandler is an implementation of the api.v1.RoutineService service.
type RoutineServiceHandler interface {
	Create(context.Context, *connect.Request[v1.CreateRoutineRequest]) (*connect.Response[v1.CreateRoutineResponse], error)
	Get(context.Context, *connect.Request[v1.GetRoutineRequest]) (*connect.Response[v1.GetRoutineResponse], error)
	Update(context.Context, *connect.Request[v1.UpdateRoutineRequest]) (*connect.Response[v1.UpdateRoutineResponse], error)
	Delete(context.Context, *connect.Request[v1.DeleteRoutineRequest]) (*connect.Response[v1.DeleteRoutineResponse], error)
	List(context.Context, *connect.Request[v1.ListRoutinesRequest]) (*connect.Response[v1.ListRoutinesResponse], error)
	AddExercise(context.Context, *connect.Request[v1.AddExerciseRequest]) (*connect.Response[v1.AddExerciseResponse], error)
	RemoveExercise(context.Context, *connect.Request[v1.RemoveExerciseRequest]) (*connect.Response[v1.RemoveExerciseResponse], error)
}

// NewRoutineServiceHandler builds an HTTP handler from the service implementation. It returns the
// path on which to mount the handler and the handler itself.
//
// By default, handlers support the Connect, gRPC, and gRPC-Web protocols with the binary Protobuf
// and JSON codecs. They also support gzip compression.
func NewRoutineServiceHandler(svc RoutineServiceHandler, opts ...connect.HandlerOption) (string, http.Handler) {
	routineServiceCreateHandler := connect.NewUnaryHandler(
		RoutineServiceCreateProcedure,
		svc.Create,
		connect.WithSchema(routineServiceCreateMethodDescriptor),
		connect.WithHandlerOptions(opts...),
	)
	routineServiceGetHandler := connect.NewUnaryHandler(
		RoutineServiceGetProcedure,
		svc.Get,
		connect.WithSchema(routineServiceGetMethodDescriptor),
		connect.WithHandlerOptions(opts...),
	)
	routineServiceUpdateHandler := connect.NewUnaryHandler(
		RoutineServiceUpdateProcedure,
		svc.Update,
		connect.WithSchema(routineServiceUpdateMethodDescriptor),
		connect.WithHandlerOptions(opts...),
	)
	routineServiceDeleteHandler := connect.NewUnaryHandler(
		RoutineServiceDeleteProcedure,
		svc.Delete,
		connect.WithSchema(routineServiceDeleteMethodDescriptor),
		connect.WithHandlerOptions(opts...),
	)
	routineServiceListHandler := connect.NewUnaryHandler(
		RoutineServiceListProcedure,
		svc.List,
		connect.WithSchema(routineServiceListMethodDescriptor),
		connect.WithHandlerOptions(opts...),
	)
	routineServiceAddExerciseHandler := connect.NewUnaryHandler(
		RoutineServiceAddExerciseProcedure,
		svc.AddExercise,
		connect.WithSchema(routineServiceAddExerciseMethodDescriptor),
		connect.WithHandlerOptions(opts...),
	)
	routineServiceRemoveExerciseHandler := connect.NewUnaryHandler(
		RoutineServiceRemoveExerciseProcedure,
		svc.RemoveExercise,
		connect.WithSchema(routineServiceRemoveExerciseMethodDescriptor),
		connect.WithHandlerOptions(opts...),
	)
	return "/api.v1.RoutineService/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case RoutineServiceCreateProcedure:
			routineServiceCreateHandler.ServeHTTP(w, r)
		case RoutineServiceGetProcedure:
			routineServiceGetHandler.ServeHTTP(w, r)
		case RoutineServiceUpdateProcedure:
			routineServiceUpdateHandler.ServeHTTP(w, r)
		case RoutineServiceDeleteProcedure:
			routineServiceDeleteHandler.ServeHTTP(w, r)
		case RoutineServiceListProcedure:
			routineServiceListHandler.ServeHTTP(w, r)
		case RoutineServiceAddExerciseProcedure:
			routineServiceAddExerciseHandler.ServeHTTP(w, r)
		case RoutineServiceRemoveExerciseProcedure:
			routineServiceRemoveExerciseHandler.ServeHTTP(w, r)
		default:
			http.NotFound(w, r)
		}
	})
}

// UnimplementedRoutineServiceHandler returns CodeUnimplemented from all methods.
type UnimplementedRoutineServiceHandler struct{}

func (UnimplementedRoutineServiceHandler) Create(context.Context, *connect.Request[v1.CreateRoutineRequest]) (*connect.Response[v1.CreateRoutineResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("api.v1.RoutineService.Create is not implemented"))
}

func (UnimplementedRoutineServiceHandler) Get(context.Context, *connect.Request[v1.GetRoutineRequest]) (*connect.Response[v1.GetRoutineResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("api.v1.RoutineService.Get is not implemented"))
}

func (UnimplementedRoutineServiceHandler) Update(context.Context, *connect.Request[v1.UpdateRoutineRequest]) (*connect.Response[v1.UpdateRoutineResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("api.v1.RoutineService.Update is not implemented"))
}

func (UnimplementedRoutineServiceHandler) Delete(context.Context, *connect.Request[v1.DeleteRoutineRequest]) (*connect.Response[v1.DeleteRoutineResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("api.v1.RoutineService.Delete is not implemented"))
}

func (UnimplementedRoutineServiceHandler) List(context.Context, *connect.Request[v1.ListRoutinesRequest]) (*connect.Response[v1.ListRoutinesResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("api.v1.RoutineService.List is not implemented"))
}

func (UnimplementedRoutineServiceHandler) AddExercise(context.Context, *connect.Request[v1.AddExerciseRequest]) (*connect.Response[v1.AddExerciseResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("api.v1.RoutineService.AddExercise is not implemented"))
}

func (UnimplementedRoutineServiceHandler) RemoveExercise(context.Context, *connect.Request[v1.RemoveExerciseRequest]) (*connect.Response[v1.RemoveExerciseResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("api.v1.RoutineService.RemoveExercise is not implemented"))
}