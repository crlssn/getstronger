start_db:
	docker start getstronger

run_db:
	docker rm getstronger -f
	docker run --name getstronger -d -p 5433:5432 -e POSTGRES_DB=root -e POSTGRES_USER=root -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16.4

run_migrations:
	migrate -path database/migrations/ -database "postgresql://root:root@localhost:5433/postgres?sslmode=disable" -verbose down --all
	migrate -path database/migrations/ -database "postgresql://root:root@localhost:5433/postgres?sslmode=disable" -verbose up
	sqlboiler -c ./database/sqlboiler.toml psql

run_migrations_up:
	migrate -path database/migrations/ -database "postgresql://root:root@localhost:5433/postgres?sslmode=disable" -verbose up
	sqlboiler -c ./database/sqlboiler.toml psql

migrate:
	$(MAKE) run_db
	sleep 1
	$(MAKE) run_migrations

protos:
	buf generate
	goimports -w .
	gofumpt -l -w .

generate-cert:
	@bash -c 'openssl req -x509 -out .secrets/localhost.crt -keyout .secrets/localhost.key \
	-newkey rsa:2048 -nodes -sha256 \
	-subj "/CN=localhost" -extensions EXT -config <( \
	printf "[dn]\nCN=localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth")'

test:
	go test ./... --count=1

run_backend:
	go run ./server/cmd/main.go

run_web:
	cd web && npm run dev

format:
	goimports -w .
	gofumpt -l -w .
	cd web && npx sort-package-json
	cd web && npm run format
	terraform fmt -recursive

lint:
	golangci-lint run
	buf lint
	cd web && npm run lint

gen:
	go generate ./...

vet:
	go vet ./...
