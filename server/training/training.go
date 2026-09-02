// Package training is the training bounded context: the plans an athlete
// follows, the routines and exercises those plans are built from, and the
// workouts they produce.
//
// The package owns the rules of that vocabulary and nothing else, and states
// it in its own types. Persistence, RPC and messaging live outside it and call
// in: the store reads rows into these types and the RPC edge renders them.
package training
