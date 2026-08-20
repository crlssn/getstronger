# Mobile rules (`mobile/`)

Capacitor wrappers around the web app. There is no separate mobile UI — the
iOS and Android projects load the built web bundle, so a user-visible change
belongs in `web/` and reaches mobile through a sync.

- After changing the web app, run `mise run mobile:sync` before building or
  running a native app.
- Run the apps with `mise run app:ios` and `mise run app:android`.
- `android/` and `ios/` are generated project shells: edit them only for genuine
  native configuration (permissions, capabilities, signing), never to work
  around something better fixed in `web/`.
