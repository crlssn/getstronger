# =============================================================================
# Database Commands
# =============================================================================

db_init:
	$(MAKE) clean_db
	docker run --name getstronger -d -p 5433:5432 \
	-e POSTGRES_DB=root \
	-e POSTGRES_USER=root \
	-e POSTGRES_HOST_AUTH_METHOD=trust \
	postgres:16.4

db_start:
	docker start getstronger

db_migrate:
	migrate -path database/migrations/ -database "postgresql://root:root@localhost:5433/postgres?sslmode=disable" -verbose down --all
	migrate -path database/migrations/ -database "postgresql://root:root@localhost:5433/postgres?sslmode=disable" -verbose up
	sqlboiler -c ./database/sqlboiler.toml psql

db_migrate_up:
	migrate -path database/migrations/ -database "postgresql://root:root@localhost:5433/postgres?sslmode=disable" -verbose up
	sqlboiler -c ./database/sqlboiler.toml psql

db_seed:
	go run server/testing/factory/seed/main.go -email=john@doe.com -password=123 -firstname=John -lastname=Doe

# =============================================================================
# Code Generation Commands
# =============================================================================

gen:
	$(MAKE) gen_go
	$(MAKE) gen_certs
	$(MAKE) gen_protos

gen_go:
	go generate ./...

gen_certs:
	@bash -c 'openssl req -x509 -out .secrets/localhost.crt -keyout .secrets/localhost.key \
	-newkey rsa:2048 -nodes -sha256 \
	-subj "/CN=localhost" -extensions EXT -config <( \
	printf "[dn]\nCN=localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth")'

gen_protos:
	buf generate
	$(MAKE) format_backend

# =============================================================================
# Test Commands
# =============================================================================

test:
	$(MAKE) test_web
	$(MAKE) test_backend

test_web:
	cd web && npm run build
	# cd web && npm run test:unit

test_backend:
	go test ./... --count=1

# ==============================================================================
# Application Commands
# ==============================================================================

app:
	$(MAKE) app_web &
	$(MAKE) app_backend &
	wait

app_web:
	cd web && npm install
	cd web && npm run dev

app_backend:
	go run ./server/cmd/main.go

# ==============================================================================
# Code Quality Commands
# ==============================================================================

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
	$(MAKE) lint_protos
	$(MAKE) lint_backend

lint_web:
	cd web && npm run lint

lint_protos:
	buf lint

lint_backend:
	golangci-lint run

vet:
	$(MAKE) vet_go

vet_go:
	go vet ./...

# ==============================================================================
# Package Installation Commands
# ==============================================================================

install:
	$(MAKE) install_go
	$(MAKE) install_js
	$(MAKE) install_tools

install_go:
	go mod download
	go mod tidy

install_js:
	cd web && npm install

install_tools:
	go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest
	go install github.com/volatiletech/sqlboiler/v4@latest
	go install github.com/volatiletech/sqlboiler/v4/drivers/sqlboiler-psql@latest
	go install github.com/bufbuild/buf/cmd/buf@latest
	go install golang.org/x/tools/cmd/goimports@latest
	go install mvdan.cc/gofumpt@latest
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# ==============================================================================
# Local Development Commands
# ==============================================================================

env_init:
	cp -n .env.example .env
	cd web && cp -n .env.example .env

setup:
	$(MAKE) install
	$(MAKE) env_init
	$(MAKE) gen_certs
	$(MAKE) db_init
	sleep 1
	$(MAKE) db_migrate
	$(MAKE) db_seed
	$(MAKE) app

# ==============================================================================
# Cleanup Commands
# ==============================================================================

clean:
	$(MAKE) clean_db

clean_db:
	docker rm -f getstronger || true
