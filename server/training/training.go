// Package training is the training bounded context: the plans an athlete
// follows, the routines and exercises those plans are built from, and the
// workouts they produce.
//
// The package owns the rules of that vocabulary and nothing else. Persistence,
// RPC and messaging live outside it and call in; the only concession is that
// entities are still the row structs generated into gen/models, which the
// whole codebase shares as its representation of a stored entity.
package training
