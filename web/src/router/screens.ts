import type { ComponentType } from 'react'

/**
 * The screen behind each route name, imported on demand.
 *
 * Kept apart from `router.tsx` because two things need it: the router, which
 * turns it into lazy routes, and `warmRoutes`, which pulls every chunk down
 * once the app is idle. Splitting it also keeps `routes.ts` free of imports of
 * the views, which would close a cycle back through the HTTP layer.
 */
export type ScreenLoader = () => Promise<{ Component: ComponentType }>

// Partial by name: the landing route has no screen of its own — its loader
// always redirects — so a lookup can legitimately come back empty.
export const screens: Partial<Record<string, ScreenLoader>> = {
  home: async () => ({ Component: (await import('@/ui/HomeView')).HomeView }),
  'list-notifications': async () => ({
    Component: (await import('@/ui/notifications/ListNotifications')).ListNotifications,
  }),
  progress: async () => ({ Component: (await import('@/ui/ProgressView')).ProgressView }),
  profile: async () => ({ Component: (await import('@/ui/profile/ProfileView')).ProfileView }),

  'user-view': async () => ({ Component: (await import('@/ui/users/UserView')).UserView }),
  'user-workouts': async () => ({
    Component: (await import('@/ui/users/UserWorkouts')).UserWorkouts,
  }),
  'user-followees': async () => ({
    Component: (await import('@/ui/users/UserFollowees')).UserFollowees,
  }),
  'user-followers': async () => ({
    Component: (await import('@/ui/users/UserFollowers')).UserFollowers,
  }),
  'user-personal-bests': async () => ({
    Component: (await import('@/ui/users/UserPersonalBests')).UserPersonalBests,
  }),

  workout: async () => ({ Component: (await import('@/ui/workouts/WorkoutView')).WorkoutView }),
  'quick-workout': async () => ({
    Component: (await import('@/ui/workouts/StartWorkout')).StartWorkout,
  }),
  'workout-routine': async () => ({
    Component: (await import('@/ui/workouts/StartWorkout')).StartWorkout,
  }),
  'view-workout': async () => ({
    Component: (await import('@/ui/workouts/ViewWorkout')).ViewWorkout,
  }),
  'edit-workout': async () => ({
    Component: (await import('@/ui/workouts/EditWorkout')).EditWorkout,
  }),

  plans: async () => ({ Component: (await import('@/ui/plans/PlansView')).PlansView }),
  'create-plan': async () => ({ Component: (await import('@/ui/plans/PlanForm')).PlanForm }),
  plan: async () => ({ Component: (await import('@/ui/plans/ViewPlan')).ViewPlan }),
  'edit-plan': async () => ({ Component: (await import('@/ui/plans/EditPlan')).EditPlan }),

  routines: async () => ({ Component: (await import('@/ui/routines/ListRoutines')).ListRoutines }),
  'create-routine': async () => ({
    Component: (await import('@/ui/routines/CreateRoutine')).CreateRoutine,
  }),
  routine: async () => ({ Component: (await import('@/ui/routines/ViewRoutine')).ViewRoutine }),
  'edit-routine': async () => ({
    Component: (await import('@/ui/routines/EditRoutine')).EditRoutine,
  }),

  exercises: async () => ({
    Component: (await import('@/ui/exercises/ListExercises')).ListExercises,
  }),
  'create-exercise': async () => ({
    Component: (await import('@/ui/exercises/CreateExercise')).CreateExercise,
  }),
  'view-exercise': async () => ({
    Component: (await import('@/ui/exercises/ViewExercise')).ViewExercise,
  }),
  'update-exercise': async () => ({
    Component: (await import('@/ui/exercises/UpdateExercise')).UpdateExercise,
  }),

  login: async () => ({ Component: (await import('@/ui/auth/UserLogin')).UserLogin }),
  signup: async () => ({ Component: (await import('@/ui/auth/UserSignup')).UserSignup }),
  logout: async () => ({ Component: (await import('@/ui/auth/UserLogout')).UserLogout }),
  'verify-email': async () => ({ Component: (await import('@/ui/auth/VerifyEmail')).VerifyEmail }),
  'verify-email-pending': async () => ({
    Component: (await import('@/ui/auth/VerifyEmailPending')).VerifyEmailPending,
  }),
  'forgot-password': async () => ({
    Component: (await import('@/ui/auth/ForgotPassword')).ForgotPassword,
  }),
  'reset-password': async () => ({
    Component: (await import('@/ui/auth/ResetPassword')).ResetPassword,
  }),

  privacy: async () => ({ Component: (await import('@/ui/PrivacyPolicy')).PrivacyPolicy }),

  'not-found': async () => ({ Component: (await import('@/ui/NotFound')).NotFound }),
}
