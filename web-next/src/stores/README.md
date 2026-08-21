# Store conventions

Zustand, one store per file, named `useXStore` to match the call sites the Vue
app already had.

**State and actions live on the same object.** Actions are plain functions on
the store, so `useWorkoutStore.getState().addSet(…)` works from non-component
code the same way `useWorkoutStore()` did under Pinia.

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

**Derived values are exported selectors, not stored state.** Pinia's `computed`
has no Zustand equivalent, and duplicating the value into state lets it drift:

```ts
export const selectAuthorised = (state: AuthState) => state.userId !== '' && ...

useAuthStore(selectAuthorised)            // in a component
selectAuthorised(useAuthStore.getState()) // outside one
```

**Persistence** uses Zustand's `persist` middleware where the Pinia store had
`persist: true`, with `partialize` naming the fields explicitly so actions and
transient state never reach storage.

**Tests reset the store themselves.** Zustand stores are module singletons, so
there is no `setActivePinia(createPinia())` equivalent; a `beforeEach` that
merges the initial values back in does the same job:

```ts
beforeEach(() => {
  useAuthStore.setState({ userId: '', accessToken: '' })
})
```

Merge, do not replace — `setState(…, true)` would drop the actions too.
Specs for a persisted store should also clear `localStorage`.
