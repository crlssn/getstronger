# Protobuf rules (`proto/`)

The API schema. Everything under `server/gen/proto`, `web/src/proto`, and
`mobile/proto` is generated from here and never edited by hand.

- After editing a `.proto`, run `mise run gen:protos` and commit the regenerated
  code alongside the schema change.
- Lint with `mise run lint:protos` (buf plus the rules in `protolint.yml`).
- Treat the schema as a published API: adding fields is safe, renaming or
  renumbering them is not. Never reuse a field number.
