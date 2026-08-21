// TODO(#1100): placeholder root component. Port web/src/App.vue once
// AppDashboard, GuestView, AppOfflineBanner, AppUpdateBanner, and
// AppConfirmDialog have React equivalents (see MIGRATION_PLAN.md phase E).
// No visible text here — the no-hardcoded-strings guard applies from phase D
// onward, and there is nothing yet worth routing through the catalogue.
export default function App() {
  return <div className="statusbar-scrim" aria-hidden="true" />
}
