package interceptors

//
//const fxGroupInterceptors = `group:"interceptors"`
//
//func NewModule() fx.Option {
//	return fx.Provide(
//		fx.Annotate(
//			NewAuth,
//			fx.ResultTags(fxGroupInterceptors),
//		),
//		fx.Annotate(
//			NewValidator,
//			fx.ResultTags(fxGroupInterceptors),
//		),
//		fx.Annotate(
//			newServerOptions,
//			fx.ParamTags(fxGroupInterceptors),
//		),
//	)
//}
//
//func newServerOptions(interceptors []connect.UnaryInterceptorFunc) []connect.HandlerOption {
//	var opts []connect.HandlerOption
//	for _, i := range interceptors {
//		opts = append(opts, connect.WithInterceptors(i))
//	}
//	return opts
//
//	//connect.WithInterceptors(newAuth(nil, nil))
//
//	//var opts []grpc.ServerOption
//	//for _, i := range interceptors {
//	//	opts = append(opts, grpc.UnaryInterceptor(i.Unary()))
//	//	opts = append(opts, grpc.StreamInterceptor(i.Stream()))
//	//}
//	//return opts
//}
