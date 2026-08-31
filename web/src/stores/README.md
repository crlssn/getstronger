# Store conventions

Zustand, one store per file, each exported as `useXStore` — the `use` prefix
because reading one inside a component is a hook subscription like any other.

**State and actions live on the same object.** Actions are plain functions on
the store rather than a separate dispatch layer, so code that is not a
component at all can still reach one: `jwt/jwt.ts` calls `setAccessToken`
through `useAuthStore.getState()`, and `http/interceptors.ts` reads the token
back the same way.

**Reading from a component** goes through a selector, so the component only
re-renders when that slice changes:

```ts
const online = useConnectionStore((state) => state.online)
```

**Reading from outside a component** — interceptors, the JWT refresh, anything
that is not a hook — uses `getState()`:

```ts
const { accessToken } = useAuthStore.getState()
```

**Derived values are exported selectors, not stored state.** A store holds
what it was told; anything computed from that is a function of it, and copying
the computed value into state gives it a second place to be wrong:

```ts
export const selectAuthorised = (state: AuthState) => state.userId !== '' && ...

useAuthStore(selectAuthorised)            // in a component
selectAuthorised(useAuthStore.getState()) // outside one
```

A selector is written as a standalone function of the state so both call sites
above can use it — one subscribing, one reading once.

**Persistence** uses Zustand's `persist` middleware over `migratedStorage` from
[`persistence.ts`](persistence.ts). Seven stores persist: `auth`, `dashboard`,
`emailVerification`, `locale`, `mutationQueue`, `preferences` and `workout`. Each names
its fields in `partialize` explicitly, so actions and transient state never
reach storage — a store that persisted its whole object would write its own
functions out and read them back as data.

**Tests reset the store themselves.** A store is a module singleton, so state
set by one test is still there in the next; a `beforeEach` that merges the
initial values back in is what isolates them:

```ts
beforeEach(() => {
  useAuthStore.setState({ userId: '', accessToken: '' })
})
```

Merge, do not replace — `setState(…, true)` would drop the actions too.
Specs for a persisted store should also clear `localStorage`.
