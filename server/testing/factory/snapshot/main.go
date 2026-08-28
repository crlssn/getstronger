// Command snapshot copies the seeded rows into a schema of their own and puts
// them back on demand. Browser end-to-end tests reset the database between spec
// files; seeding again costs seconds each time, and copying the tables back
// costs milliseconds. See web/tests/e2e/seed.ts.
//
// Unlike its sibling commands this one fails loudly. A capture or a restore
// that quietly did nothing would surface as the next spec file failing on data
// it never wrote.
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"strings"

	"github.com/joho/godotenv"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/db"
)

// The copies live in a schema of their own so that nothing reading the app's
// tables sees them — bobgen, which generates the models from the live schema,
// included.
const snapshotSchema = "e2e_snapshot"

var (
	errUnknownMode = errors.New("unknown mode")
	errNoSnapshot  = errors.New("no snapshot to restore")
	errNotLocal    = errors.New("environment must be local")
)

func main() {
	mode := flag.String("mode", "", "capture, restore or drop")
	flag.Parse()

	database, err := connect()
	if err != nil {
		panic(err)
	}
	defer func() { _ = database.Close() }()

	if err = run(context.Background(), database, *mode); err != nil {
		panic(err)
	}
}

func connect() (*sql.DB, error) {
	if err := godotenv.Load(); err != nil {
		return nil, fmt.Errorf("load .env file: %w", err)
	}

	c := config.New()
	if c.Environment != config.EnvironmentLocal {
		return nil, fmt.Errorf("%w, got %s", errNotLocal, c.Environment)
	}

	database, err := db.New(c)
	if err != nil {
		return nil, fmt.Errorf("connect to database: %w", err)
	}

	return database, nil
}

func run(ctx context.Context, database *sql.DB, mode string) error {
	switch mode {
	case "capture":
		return capture(ctx, database)
	case "restore":
		return restore(ctx, database)
	case "drop":
		return drop(ctx, database)
	default:
		return fmt.Errorf("%w: %q", errUnknownMode, mode)
	}
}

// A generated column rejects a value on the way back in, so the copy holds the
// columns a row is actually written with and the restore names them.
func capture(ctx context.Context, database *sql.DB) error {
	copied, err := tables(ctx, database, "public")
	if err != nil {
		return err
	}

	statements := []string{
		fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", snapshotSchema),
		fmt.Sprintf("CREATE SCHEMA %s", snapshotSchema),
	}
	for _, copiedTable := range copied {
		statements = append(statements, fmt.Sprintf(
			`CREATE TABLE %s.%q AS SELECT %s FROM public.%q`,
			snapshotSchema, copiedTable.name, copiedTable.columnList(), copiedTable.name,
		))
	}

	for _, statement := range statements {
		if _, err = database.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("capture snapshot: %w", err)
		}
	}

	return nil
}

// Restoring runs on one connection, inside one transaction, because
// session_replication_role is a session setting: with foreign key triggers off
// the tables can go back in any order, which spares the command a topological
// sort of the schema. Both the local container and the CI service grant the
// application user superuser, which is what setting it requires.
func restore(ctx context.Context, database *sql.DB) error {
	snapshot, err := tables(ctx, database, snapshotSchema)
	if err != nil {
		return err
	}
	if len(snapshot) == 0 {
		return errNoSnapshot
	}

	// Emptied from the live schema rather than from the snapshot, so a table a
	// migration added after the capture is still cleared rather than carrying
	// one spec file's rows into the next.
	live, err := tables(ctx, database, "public")
	if err != nil {
		return err
	}

	qualified := make([]string, 0, len(live))
	for _, liveTable := range live {
		qualified = append(qualified, fmt.Sprintf(`public.%q`, liveTable.name))
	}

	statements := []string{
		"SET LOCAL session_replication_role = replica",
		fmt.Sprintf("TRUNCATE TABLE %s RESTART IDENTITY CASCADE", strings.Join(qualified, ", ")),
	}
	// Ordered, so every restore lays the rows down in the same physical order. A list the app reads
	// without a total order of its own comes back in the order the rows sit in, and a scan of the
	// copy is free to return them differently each time — which the screenshot harness sees as a
	// page moving between two runs that photographed the same data.
	for _, snapshotTable := range snapshot {
		statements = append(statements, fmt.Sprintf(
			`INSERT INTO public.%q (%s) SELECT %s FROM %s.%q ORDER BY %s`,
			snapshotTable.name, snapshotTable.columnList(), snapshotTable.columnList(),
			snapshotSchema, snapshotTable.name, snapshotTable.columnList(),
		))
	}

	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin restore: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	for _, statement := range statements {
		if _, err = tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("restore snapshot: %w", err)
		}
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit restore: %w", err)
	}

	return nil
}

func drop(ctx context.Context, database *sql.DB) error {
	if _, err := database.ExecContext(ctx, fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", snapshotSchema)); err != nil {
		return fmt.Errorf("drop snapshot schema: %w", err)
	}

	return nil
}

type table struct {
	name    string
	columns []string
}

func (t table) columnList() string {
	quoted := make([]string, 0, len(t.columns))
	for _, column := range t.columns {
		quoted = append(quoted, fmt.Sprintf("%q", column))
	}

	return strings.Join(quoted, ", ")
}

// schema_migrations is left out: the migration state belongs to the database
// rather than to the seeded data, and a restore that reset it would strand the
// schema. Generated columns are left out because Postgres computes them and
// refuses a value for them.
func tables(ctx context.Context, database *sql.DB, schema string) ([]table, error) {
	rows, err := database.QueryContext(ctx, `
		SELECT columns.table_name, columns.column_name
		FROM information_schema.columns
		JOIN information_schema.tables
		  ON tables.table_schema = columns.table_schema
		 AND tables.table_name = columns.table_name
		WHERE columns.table_schema = $1
		  AND tables.table_type = 'BASE TABLE'
		  AND columns.table_name <> 'schema_migrations'
		  AND columns.is_generated = 'NEVER'
		ORDER BY columns.table_name, columns.ordinal_position`, schema)
	if err != nil {
		return nil, fmt.Errorf("list %s columns: %w", schema, err)
	}
	defer func() { _ = rows.Close() }()

	var found []table
	for rows.Next() {
		var name, column string
		if err = rows.Scan(&name, &column); err != nil {
			return nil, fmt.Errorf("scan column: %w", err)
		}
		if len(found) == 0 || found[len(found)-1].name != name {
			found = append(found, table{name: name})
		}
		last := &found[len(found)-1]
		last.columns = append(last.columns, column)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("read columns: %w", err)
	}

	return found, nil
}
