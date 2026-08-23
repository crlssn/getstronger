# Protobuf rules (`proto/`)

The API schema. Everything under `server/gen/proto`, `web/src/proto`, and
`mobile/proto` is generated from here and never edited by hand.

- After editing a `.proto`, run `mise run gen:protos` and commit the regenerated
  code alongside the schema change.
- Lint with `mise run lint:protos` (buf plus the rules in `protolint.yml`).
- Every procedure requires a bearer token unless it says otherwise with
  `option (guest) = true`, which only the eight pre-login procedures in
  `auth_service.proto` carry. The server's auth interceptor reads the option off
  the descriptor of the method it is about to serve, so a new service needs
  registering nowhere else; a method that says nothing, and one whose descriptor
  the interceptor cannot read, both require a token.
- Treat the schema as a published API: adding fields is safe, renaming or
  renumbering them is not. Never reuse a field number.
