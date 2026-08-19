import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { usePageTitleStore } from '@/stores/pageTitle'
import { createRouter, createWebHistory, type Router } from 'vue-router'
import { useActionButton } from '@/stores/actionButton.ts'
import { useNavTabs } from '@/stores/navTabs.ts'

const router: Router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      beforeEnter: [auth],
      component: () => import('@/ui/HomeView.vue'),
      meta: { titleKey: 'pages.home' },
      name: 'home',
      path: '/home',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/notifications/ListNotifications.vue'),
      meta: { titleKey: 'pages.notifications' },
      name: 'list-notifications',
      path: '/notifications',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/ProgressView.vue'),
      meta: { titleKey: 'pages.progress' },
      name: 'progress',
      path: '/progress',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/profile/ProfileView.vue'),
      meta: { titleKey: 'pages.profile' },
      name: 'profile',
      path: '/profile',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/users/UserView.vue'),
      meta: { titleKey: '' },
      name: 'user-view',
      path: '/users/:id',
      children: [
        {
          path: '/users/:id',
          props: true,
          component: () => import('@/ui/users/UserWorkouts.vue'),
        },
        {
          path: 'follows',
          props: true,
          component: () => import('@/ui/users/UserFollowees.vue'),
        },
        {
          path: 'followers',
          props: true,
          component: () => import('@/ui/users/UserFollowers.vue'),
        },
        {
          path: 'personal-bests',
          props: true,
          component: () => import('@/ui/users/UserPersonalBests.vue'),
        },
      ],
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/workouts/WorkoutView.vue'),
      meta: { titleKey: 'pages.workout' },
      name: 'workout',
      path: '/workout',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/workouts/StartWorkout.vue'),
      meta: { focusedShell: true, titleKey: 'pages.quickWorkout' },
      name: 'quick-workout',
      path: '/workouts/quick',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/workouts/ViewWorkout.vue'),
      meta: { titleKey: '' },
      name: 'view-workout',
      path: '/workouts/:id',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/workouts/EditWorkout.vue'),
      meta: { titleKey: 'pages.editWorkout' },
      name: 'edit-workout',
      path: '/workouts/:id/edit',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/workouts/StartWorkout.vue'),
      meta: { focusedShell: true, titleKey: '' },
      name: 'workout-routine',
      path: '/workouts/routine/:routine_id',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/plans/PlansView.vue'),
      meta: { titleKey: 'pages.training' },
      name: 'plans',
      path: '/plans',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/plans/PlanForm.vue'),
      meta: { titleKey: 'pages.newPlan' },
      name: 'create-plan',
      path: '/plans/create',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/plans/ViewPlan.vue'),
      meta: { titleKey: 'pages.plan' },
      name: 'plan',
      path: '/plans/:id',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/plans/PlanForm.vue'),
      meta: { titleKey: 'pages.editPlan' },
      name: 'edit-plan',
      path: '/plans/:planId/edit',
      props: true,
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/routines/ListRoutines.vue'),
      meta: { titleKey: 'pages.routines' },
      name: 'routines',
      path: '/routines',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/routines/CreateRoutine.vue'),
      meta: { titleKey: 'pages.createRoutine' },
      name: 'create-routine',
      path: '/routines/create',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/routines/ViewRoutine.vue'),
      meta: { titleKey: 'pages.routine' },
      name: 'routine',
      path: '/routines/:id',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/routines/EditRoutine.vue'),
      meta: { titleKey: 'pages.updateRoutine' },
      name: 'edit-routine',
      path: '/routines/:id/edit',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/exercises/ListExercises.vue'),
      meta: { titleKey: 'pages.exercises' },
      name: 'exercises',
      path: '/exercises',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/exercises/CreateExercise.vue'),
      meta: { titleKey: 'pages.createExercise' },
      name: 'create-exercise',
      path: '/exercises/create',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/exercises/ViewExercise.vue'),
      meta: { titleKey: 'pages.viewExercise' },
      name: 'view-exercise',
      path: '/exercises/:id',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/exercises/UpdateExercise.vue'),
      meta: { titleKey: 'pages.updateExercise' },
      name: 'update-exercise',
      path: '/exercises/:id/edit',
    },
    {
      beforeEnter: [guest],
      component: () => import('@/ui/auth/UserLogin.vue'),
      meta: { titleKey: 'pages.login' },
      name: 'login',
      path: '/login',
    },
    {
      beforeEnter: [guest],
      component: () => import('@/ui/auth/UserSignup.vue'),
      meta: { titleKey: 'pages.createAccount' },
      name: 'signup',
      path: '/signup',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/auth/UserLogout.vue'),
      name: 'logout',
      path: '/logout',
    },
    {
      beforeEnter: [guest],
      component: () => import('@/ui/auth/VerifyEmail.vue'),
      name: 'verify-email',
      path: '/verify-email',
    },
    {
      beforeEnter: [guest],
      component: () => import('@/ui/auth/VerifyEmailPending.vue'),
      meta: { titleKey: 'pages.verifyEmail' },
      name: 'verify-email-pending',
      path: '/verify-email/pending',
    },
    {
      beforeEnter: [guest],
      component: () => import('@/ui/auth/ForgotPassword.vue'),
      meta: { titleKey: 'pages.resetPassword' },
      name: 'forgot-password',
      path: '/forgot-password',
    },
    {
      beforeEnter: [guest],
      component: () => import('@/ui/auth/ResetPassword.vue'),
      meta: { titleKey: 'pages.chooseNewPassword' },
      name: 'reset-password',
      path: '/reset-password',
    },
    {
      // TODO: Create a landing page.
      beforeEnter: [landing],
      children: [],
      component: null,
      name: 'landing',
      path: '/',
    },
    {
      component: () => import('@/ui/NotFound.vue'),
      meta: { titleKey: 'pages.notFound' },
      name: 'not-found',
      path: '/:pathMatch(.*)*',
    },
  ],
})

router.beforeEach((to, from, next) => {
  if (to.name !== from.name) {
    const navTabs = useNavTabs()
    navTabs.reset()
  }

  const actionButton = useActionButton()
  actionButton.reset()

  // Routes carry catalogue keys, not display strings, so the header follows
  // the selected locale. Screens with dynamic titles set their own.
  const pageTitleStore = usePageTitleStore()
  const titleKey = to.meta.titleKey as string
  pageTitleStore.setPageTitle(titleKey ? i18n.global.t(titleKey) : '')

  next()
})

async function auth() {
  const authStore = useAuthStore()
  if (!authStore.accessToken) {
    return {
      path: '/login',
    }
  }
}

async function guest() {
  const authStore = useAuthStore()
  if (authStore.accessToken) {
    return {
      path: '/home',
    }
  }
}

async function landing() {
  const authStore = useAuthStore()
  if (authStore.accessToken) return { path: '/home' }
  return { path: '/login' }
}

export default router
