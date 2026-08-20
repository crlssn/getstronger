# Backend rules (`server/`)

Go backend. `rpc/` holds the Connect handlers (the terminal layer), `repo/` the
database access and domain sentinels, `gen/` generated models and protobuf code
that is never edited by hand.

Verify with `mise run test:backend`, `mise run lint:backend`, and
`mise run vet:go`. Restart this worktree's backend after verification so the
running app uses the new code.

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
8. **Translate foreign errors into package-owned sentinels.** The `repo`
   package owns domain sentinels such as `repo.ErrAuthEmailExists` and
   `repo.ErrPlanNotActive`; extend that vocabulary rather than leaking
   library errors to callers. Deliberate exception: `sql.ErrNoRows` is this
   codebase's not-found signal — `repo` passes it through wrapped, and
   handlers branch on it with `errors.Is(err, sql.ErrNoRows)`.
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
