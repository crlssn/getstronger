# Protobuf rules (`proto/`)

The API schema. Everything under `server/gen/proto`, `web/src/proto`, and
`mobile/proto` is generated from here and never edited by hand.

- After editing a `.proto`, run `mise run gen:protos` and commit the regenerated
  code alongside the schema change.
- Lint with `mise run lint:protos` (buf plus the rules in `protolint.yml`).
- `option (auth) = true` is the whole of a procedure's authentication rule. The
  server's auth interceptor reads it off the descriptor of the method it is
  about to serve, so a new service needs registering nowhere else; a procedure
  without the option is public, and one whose descriptor the interceptor cannot
  read is refused.
- Treat the schema as a published API: adding fields is safe, renaming or
  renumbering them is not. Never reuse a field number.
