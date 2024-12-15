import { useAuthStore } from '@/stores/auth'
import { usePageTitleStore } from '@/stores/pageTitle'
import { logout as logoutRequest } from '@/http/requests.ts'
import { useNotificationStore } from '@/stores/notifications.ts'
import { createRouter, createWebHistory, type Router } from 'vue-router'
import { useActionButton } from '@/stores/actionButton.ts'
import { useNavTabs } from '@/stores/navTabs.ts'

const router: Router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      beforeEnter: [auth],
      component: () => import('@/ui/HomeView.vue'),
      meta: { title: 'Home' },
      name: 'home',
      path: '/home',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/notifications/ListNotifications.vue'),
      meta: { title: 'Notifications' },
      name: 'list-notifications',
      path: '/notifications',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/profile/ProfileView.vue'),
      meta: { title: 'Profile' },
      name: 'profile',
      path: '/profile',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/users/UserView.vue'),
      meta: { title: '' },
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
      component: () => import('@/ui/workouts/ViewWorkout.vue'),
      meta: { title: '' },
      name: 'view-workout',
      path: '/workouts/:id',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/workouts/EditWorkout.vue'),
      meta: { title: 'Edit Workout' },
      name: 'edit-workout',
      path: '/workouts/:id/edit',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/workouts/StartWorkout.vue'),
      meta: { title: '' },
      name: 'workout-routine',
      path: '/workouts/routine/:routine_id',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/routines/ListRoutines.vue'),
      meta: { title: 'Routines' },
      name: 'routines',
      path: '/routines',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/routines/CreateRoutine.vue'),
      meta: { title: 'Create Routine' },
      name: 'create-routine',
      path: '/routines/create',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/routines/ViewRoutine.vue'),
      meta: { title: 'Routine' },
      name: 'routine',
      path: '/routines/:id',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/routines/EditRoutine.vue'),
      meta: { title: 'Update Routine' },
      name: 'edit-routine',
      path: '/routines/:id/edit',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/exercises/ListExercises.vue'),
      meta: { title: 'Exercises' },
      name: 'exercises',
      path: '/exercises',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/exercises/CreateExercise.vue'),
      meta: { title: 'Create Exercise' },
      name: 'create-exercise',
      path: '/exercises/create',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/exercises/ViewExercise.vue'),
      meta: { title: 'View Exercise' },
      name: 'view-exercise',
      path: '/exercises/:id',
    },
    {
      beforeEnter: [auth],
      component: () => import('@/ui/exercises/UpdateExercise.vue'),
      meta: { title: 'Update Exercise' },
      name: 'update-exercise',
      path: '/exercises/:id/edit',
    },
    {
      beforeEnter: [guest],
      component: () => import('@/ui/auth/UserLogin.vue'),
      meta: { title: 'Login' },
      name: 'login',
      path: '/login',
    },
    {
      beforeEnter: [guest],
      component: () => import('@/ui/auth/UserSignup.vue'),
      meta: { title: 'UserSignup' },
      name: 'signup',
      path: '/signup',
    },
    {
      beforeEnter: [logout],
      children: [],
      component: null,
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
      component: () => import('@/ui/auth/ForgotPassword.vue'),
      name: 'forgot-password',
      path: '/forgot-password',
    },
    {
      beforeEnter: [guest],
      component: () => import('@/ui/auth/ResetPassword.vue'),
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
      meta: { title: 'Not Found' },
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

  const pageTitleStore = usePageTitleStore()
  pageTitleStore.setPageTitle(to.meta.title as string)

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

async function logout() {
  await logoutRequest()
  const authStore = useAuthStore()
  authStore.logout()

  const notificationStore = useNotificationStore()
  notificationStore.unreadCount = 0

  return {
    path: '/login',
  }
}

async function landing() {
  const authStore = useAuthStore()
  if (authStore.accessToken) return { path: '/home' }
  return { path: '/login' }
}

export default router
