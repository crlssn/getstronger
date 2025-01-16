package main

import (
	"flag"
	"fmt"
	"log"

	"github.com/joho/godotenv"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/db"
	"github.com/crlssn/getstronger/server/testing/factory"
)

const (
	userCount           = 10
	exerciseCount       = 10
	routineCount        = 5
	workoutCount        = 5
	workoutSetCount     = 5
	workoutCommentCount = 2
)

func main() {
	if err := godotenv.Load(); err != nil {
		panic(fmt.Errorf("failed to load .env file: %w", err))
	}

	c := config.New()
	if c.Environment != config.EnvironmentLocal {
		log.Printf("environment must be local, got %s", c.Environment)
		return
	}

	database, err := db.New(c)
	if err != nil {
		log.Printf("failed to connect to database: %v", err)
		return
	}

	email := flag.String("email", "", "the user's email")
	password := flag.String("password", "", "the user's password")
	firstname := flag.String("firstname", "", "the user's first name")
	lastname := flag.String("lastname", "", "the user's last name")
	flag.Parse()

	var user *factory.SeedUser
	if !empty(*email, *password, *firstname, *lastname) {
		user = &factory.SeedUser{
			Email:     *email,
			Password:  *password,
			FirstName: *firstname,
			LastName:  *lastname,
		}
	}

	f := factory.NewFactory(database)
	f.Seed(factory.SeedParams{
		User:                user,
		UserCount:           userCount,
		ExerciseCount:       exerciseCount,
		RoutineCount:        routineCount,
		WorkoutCount:        workoutCount,
		WorkoutSetCount:     workoutSetCount,
		WorkoutCommentCount: workoutCommentCount,
	})
}

func empty(slice ...string) bool {
	for _, s := range slice {
		if s == "" {
			return true
		}
	}

	return false
}
