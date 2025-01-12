package main

import (
	"fmt"
	"log"

	"github.com/joho/godotenv"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/db"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func main() {
	if err := godotenv.Load(); err != nil {
		panic(fmt.Errorf("failed to load .env file: %w", err))
	}

	c := config.New()
	if c.Environment != "local" {
		log.Printf("environment must be local, got %s", c.Environment)
		return
	}

	database, err := db.New(c)
	if err != nil {
		log.Printf("failed to connect to database: %v", err)
		return
	}

	f := factory.NewFactory(database)
	f.Seed(factory.SeedParams{
		UserCount:           10,
		ExerciseCount:       10,
		RoutineCount:        5,
		WorkoutCount:        5,
		WorkoutSetCount:     5,
		WorkoutCommentCount: 2,
	})
}
