package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	_ "github.com/lib/pq"
)

func main() {
	connStr := "postgres://root:root@localhost:5433/postgres?sslmode=disable"
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err = db.Ping(); err != nil {
		log.Fatal(err)
	}

	listener := pq.NewListener(connStr, time.Second, time.Minute, nil)
	defer listener.Close()

	err = listener.Listen("test_topic")
	if err != nil {
		log.Fatal(err)
	}

	log.Println("Listening for notifications on 'test_topic'...")
	for {
		sendNotification(db, "test_topic", Payload{
			ActorID:   uuid.NewString(),
			WorkoutID: uuid.NewString(),
		})
		select {
		case notification := <-listener.Notify:
			if notification == nil {
				log.Println("Listener disconnected")
				return
			}

			var payload Payload
			if err = json.Unmarshal([]byte(notification.Extra), &payload); err != nil {
				log.Fatal(fmt.Errorf("failed to unmarshal payload: %w", err))
			}

			log.Printf("Received notification: %s - %+v", notification.Channel, payload)
		}
	}
}

type Payload struct {
	ActorID   string `json:"actor_id"`
	WorkoutID string `json:"workout_id"`
}

func sendNotification(db *sql.DB, channel string, message Payload) {
	bytes, err := json.Marshal(message)
	if err != nil {
		log.Fatal(fmt.Errorf("failed to marshal payload: %w", err))
	}

	if _, err = db.Exec("SELECT pg_notify($1, $2)", channel, bytes); err != nil {
		log.Fatal(fmt.Errorf("failed to send notification: %w", err))
	}
}
