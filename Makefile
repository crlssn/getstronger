run_db:
	docker rm getstronger -f
	docker run --name getstronger -d -p 5433:5432 -e POSTGRES_DB=root -e POSTGRES_USER=root -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16.4

run_migrations:
	migrate -path db/migrations/ -database "postgresql://root:root@localhost:5433/postgres?sslmode=disable" -verbose down --all
	migrate -path db/migrations/ -database "postgresql://root:root@localhost:5433/postgres?sslmode=disable" -verbose up
	sqlboiler -c ./db/sqlboiler.toml psql

migrate:
	$(MAKE) run_db
	sleep 1
	$(MAKE) run_migrations

protos:
	buf generate
