# Start the existing database container
start_db:
	docker start getstronger

# Run a new database container
run_db:
	$(MAKE) clean
	docker run --name getstronger -d -p 5433:5432 \
	-e POSTGRES_DB=root \
	-e POSTGRES_USER=root \
	-e POSTGRES_HOST_AUTH_METHOD=trust \
	postgres:16.4

# Run all database migrations
run_migrations:
	migrate -path database/migrations/ -database "postgresql://root:root@localhost:5433/postgres?sslmode=disable" -verbose down --all
	migrate -path database/migrations/ -database "postgresql://root:root@localhost:5433/postgres?sslmode=disable" -verbose up
	sqlboiler -c ./database/sqlboiler.toml psql

# Run only upward migrations
run_migrations_up:
	migrate -path database/migrations/ -database "postgresql://root:root@localhost:5433/postgres?sslmode=disable" -verbose up
	sqlboiler -c ./database/sqlboiler.toml psql

# Seed the database with test data
seed_db:
	go run server/testing/factory/seed/main.go -email=john@doe.com -password=123 -firstname=John -lastname=Doe

# Full database setup with migrations
migrate:
	$(MAKE) run_db
	sleep 1
	$(MAKE) run_migrations

# Generate Protocol Buffers
protos:
	buf generate
	$(MAKE) format_backend

# Generate SSL certificates for local backend server
gen_certs:
	@bash -c 'openssl req -x509 -out .secrets/localhost.crt -keyout .secrets/localhost.key \
	-newkey rsa:2048 -nodes -sha256 \
	-subj "/CN=localhost" -extensions EXT -config <( \
	printf "[dn]\nCN=localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth")'

# Run backend tests and build web app
test:
	go test ./... --count=1
	cd web && npm run build

# Run the backend server
run_backend:
	go run ./server/cmd/main.go

# Run the frontend development server
run_web:
	cd web && npm install
	cd web && npm run dev

# Format all files
format:
	$(MAKE) format_web
	$(MAKE) format_backend
	$(MAKE) format_terraform

format_web:
	cd web && npx sort-package-json
	cd web && npm run format

format_backend:
	goimports -w .
	gofumpt -l -w .

format_terraform:
	terraform fmt -recursive

lint:
	$(MAKE) lint_web
	$(MAKE) lint_backend
	$(MAKE) lint_protos

lint_web:
	cd web && npm run lint

lint_backend:
	golangci-lint run

lint_protos:
	buf lint

# Generate code
gen:
	go generate ./...

# Static analysis
vet:
	go vet ./...

# Clean up Docker containers and artifacts
clean:
	docker rm -f getstronger || true

# Full setup for development environment
setup:
	$(MAKE) install_tools
	$(MAKE) init_env
	$(MAKE) gen_certs
	$(MAKE) run_db
	sleep 1
	$(MAKE) run_migrations
	$(MAKE) db_seed
	$(MAKE) run_web
	$(MAKE) run_backend

init_env:
	cp -n .env.example .env
	cd web && cp -n .env.example .env

install_tools:
	go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest
	go install github.com/volatiletech/sqlboiler/v4@latest
	go install github.com/volatiletech/sqlboiler/v4/drivers/sqlboiler-psql@latest
	go install github.com/bufbuild/buf/cmd/buf@latest
	go install golang.org/x/tools/cmd/goimports@latest
	go install mvdan.cc/gofumpt@latest
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
