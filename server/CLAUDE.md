# Backend rules (`server/`)

Go backend, organised around what the app does rather than how it is built.

Verify with `mise run test:backend`, `mise run lint:backend`, and
`mise run vet:go`. Restart this worktree's backend after verification so the
running app uses the new code.

## Finding coverage gaps

`mise run test:backend:coverage [packages]` runs the tests under
[tobari](https://github.com/goccy/tobari) instrumentation and writes two files
to `.tobari/`, which Git ignores:

- `coverage.out` is an ordinary coverprofile — `awk '$NF == 0' .tobari/coverage.out`
  lists every block no test reached, which is where a gap is.
- `tobari.json` is the same run *scoped*: one entry per test under `counts`,
  holding the blocks that test reached. It answers what a coverprofile cannot —
  which test covers a line, and which two tests cover the same thing.
  `tobari html -o coverage.html .tobari/tobari.json` renders it.

Pass a package pattern to measure part of the tree in seconds rather than the
whole backend in minutes. The first instrumented build is slow whatever the
scope — a whole-program analysis per test binary — and the ones after it are
ordinary build time.

Nothing measures this in CI: `test.server.yml` reports the plain coverprofile
to Codecov as it always has, and this is a tool for whoever is closing a gap.

## Where code goes

A package per bounded context owns that context's vocabulary and its rules.
None of them knows about SQL, HTTP, RPC or messaging, and `depguard` fails the
build if one starts to — the deny list in `.golangci.yml` says why for each:

| Package             | Owns                                                           |
| ------------------- | -------------------------------------------------------------- |
| `training/`         | Plans and their rotation, routines, exercises, workouts, weeks  |
| `account/`          | Email addresses, usernames, passwords, verification, recovery   |
| `notification/`     | Notification types, stored payloads, who hears about what       |
| `pubsub/events/`    | The topics events are published under, and what each carries    |

Around them sit the packages that talk to the outside world, and which hold no
business rules of their own:

- `repo/` is the single persistence adapter. `repo.Repo` reads and writes rows;
  a `Repo` bound to a transaction is the same type as one bound to the pool,
  which is what lets `NewTx` hand a use case a transactional store.
- `rpc/` is the Connect edge. Handlers authenticate, translate, log once and
  return; `rpc/parser` is the only place proto and stored rows meet.
- `pubsub/`, `email/`, `jwt/`, `cookies/`, `trace/`, `db/` are the remaining
  adapters. `gen/` is generated and never edited by hand.

When a rule needs a home, ask which type already knows the thing the rule is
about, and put it there — `Plan` decides when it may rotate, `Week` decides
what a week of training adds up to. Reach for a coordinator only when a use
case genuinely spans collaborators, as the dashboard does; it stays small and
holds no knowledge of its own.

Name types after the responsibility they carry. `service`, `manager`, `helper`
and `utils` are not responsibilities and do not belong in a name.

An import the guard rejects is usually a rule in the wrong package rather than a
rule that needs an exception. A decision that needs a query wants the query run
by the caller and the result passed in; one that needs to log wants to return an
error the terminal layer logs once. Widen the deny list when a context grows a
new neighbour it should not know about; narrow it only with a reason in the
commit message.

## Depending on the store

Consumers declare the slice of `repo.Repo` they use, as an interface named for
what that slice is for — `planRotation`, `dashboardSources`, `TraceStore`. A
port earns its place when the dependency really is a slice: it documents what
a type touches, and it is what the pub/sub subscribers are tested against.
Where a use case needs most of the adapter, depend on `*repo.Repo` directly
rather than restating it under another name.

Bind ports to the adapter in the fx module that declares them, not in each
application that assembles the server, so a new dependency cannot leave one
wiring behind.

## Error handling

Conventions summarised from
[The 10 Golang Error Handling Commandments](https://preslav.me/2026/05/19/10-golang-error-handling-commandments/),
adapted to this codebase.

1. **Never ignore an error.** Every fallible call gets a handled error branch.
   The only tolerated discard is `_ = rows.Close()` in a `defer` on a read path.
2. **Wrap when crossing a package boundary.** Add the context the caller lacks —
   the operation, the identifier, the dependency — with
   `fmt.Errorf("plan insert: %w", err)`.
3. **Return bare errors within a package.** Inside one package the caller
   already has the context; `return err` keeps chains short. Don't re-wrap an
   error that a sibling function in the same package already wrapped.
4. **Name the attempted action, not the failure.** Write `"plan insert: %w"`,
   never `"failed to insert plan: %w"` or `"plan insert failed: %w"`. Chains
   then read as a story: `plan advance transaction: plan get before advance:
   sql: no rows in result set`.
5. **Don't repeat what the inner error already says.** If the wrapped error
   carries the path or detail, add only the higher-level operation.
6. **Never build behavior on error strings.** Branch with `errors.Is` on
   sentinels or `errors.As` on typed errors — in production code *and* in
   tests. Don't assert on the message text of wrapped chains, and never on text
   owned by a dependency.
7. **`%w` is an API promise.** Wrapping with `%w` exposes the inner error to
   `errors.Is`/`errors.As` forever. Use `%v` for third-party errors callers
   have no business inspecting; reserve `%w` for errors we own or deliberately
   pass through.
8. **Translate foreign errors into package-owned sentinels.** A bounded
   context owns the sentinels for its own rules —
   `account.ErrEmailAlreadyRegistered`, `training.ErrPlanNotActive` — and
   `repo` translates the database's errors into them rather than leaking
   library errors to callers. Extend that vocabulary in the context the rule
   belongs to. Deliberate exception: `sql.ErrNoRows` is this codebase's
   not-found signal — `repo` passes it through wrapped, and handlers branch on
   it with `errors.Is(err, sql.ErrNoRows)`.
9. **Log or return — never both.** `repo` and other inner layers only return.
   The RPC handlers are the terminal layer: they log once and return a
   sanitised `connect.NewError` with no internal detail. Pub/sub handlers log
   because `HandlePayload` cannot return. No error may produce two log lines.
10. **No goroutine errors go unheard.** A goroutine cannot return an error to
    its spawner; hand the error back over a channel (buffered so the goroutine
    can exit) or an `errgroup`, or handle it terminally inside the goroutine.
11. **Cancellation is not an application error.** At terminal layers, check
    `errors.Is(err, context.Canceled)` / `context.DeadlineExceeded` before
    logging at error level or returning a 5xx-equivalent code; a client
    disconnect must not page anyone.

## Log messages

Log messages follow the same action-naming convention as error messages: the
level already carries the outcome, so no message starts with "failed to" or
"could not", and none ends with "failed". Beyond that, three rules apply to
every message regardless of level:

- **Sentence case.** Messages start with a capital letter ("Get user by ID",
  "Routine not found"), unlike error strings, which stay lowercase per Go
  convention. Test-assertion messages (`t.Fatal`, `t.Fatalf`) follow the
  error-string convention instead and stay lowercase.
- **Locatable.** A message must be more informative than the error it
  accompanies: reading it alone should give a fair idea of where in the code
  and in which flow it originated. Name the flow when the bare operation is
  ambiguous — "Fetch auth for login" and "Fetch auth for logout", never five
  call sites all logging "auth fetch". Prefer messages unique to one call
  site so a log line greps to its origin.
- **No commas.** When a message needs two clauses, join them with a colon
  and phrase the second one actively: "Event buffer full: dropping event",
  not "Event buffer full, dropping event".

Each level has its own shape:

- **Error** names the attempted action that did not succeed, with its flow
  context ("Get routine for workout name", "Persist event"), and carries the
  cause as `zap.Error(err)`. Reserve it for unexpected failures the request
  cannot recover from — an error log is a signal someone may need to act on.
- **Warn** states an expected, handled anomaly as a fact ("Routine not
  found", "Request unauthenticated", "Event buffer full: dropping event").
  Add `zap.Error(err)` when a non-sentinel error carries useful detail.
- **Info** records a completed event as a past-tense fact ("Routine created",
  "Request authenticated", "Subscribed to topic").
- **Fatal** is reserved for unrecoverable process-level failures such as
  startup or listen-and-serve; it exits the process, so it must never appear
  on a request path.
