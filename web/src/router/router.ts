import HomeView from '@/ui/HomeView.vue'
import NotFound from '@/ui/NotFound.vue'
import { create } from '@bufbuild/protobuf'
import { useAuthStore } from '@/stores/auth'
import { AuthClient } from '@/http/clients'
import UserView from '@/ui/users/UserView.vue'
import UserLogin from '@/ui/auth/UserLogin.vue'
import UserSignup from '@/ui/auth/UserSignup.vue'
import { usePageTitleStore } from '@/stores/pageTitle'
import ProfileView from '@/ui/profile/ProfileView.vue'
import ViewRoutine from '@/ui/routines/ViewRoutine.vue'
import ViewWorkout from '@/ui/workouts/ViewWorkout.vue'
import ListRoutines from '@/ui/routines/ListRoutines.vue'
import ListWorkouts from '@/ui/workouts/ListWorkouts.vue'
import CreateRoutine from '@/ui/routines/CreateRoutine.vue'
import { LogoutRequestSchema } from '@/proto/api/v1/auth_pb'
import ListExercises from '@/ui/exercises/ListExercises.vue'
import WorkoutRoutine from '@/ui/workouts/WorkoutRoutine.vue'
import CreateExercise from '@/ui/exercises/CreateExercise.vue'
import UpdateExercise from '@/ui/exercises/UpdateExercise.vue'
import { useNotificationStore } from '@/stores/notifications.ts'
import { createRouter, createWebHistory, type Router } from 'vue-router'
import ListNotifications from '@/ui/notifications/ListNotifications.vue'

const router: Router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      beforeEnter: [auth],
      component: HomeView,
      meta: { title: 'Home' },
      name: 'home',
      path: '/home',
    },
    {
      beforeEnter: [auth],
      component: ListNotifications,
      meta: { title: 'Notifications' },
      name: 'list-notifications',
      path: '/notifications',
    },
    {
      beforeEnter: [auth],
      component: ProfileView,
      meta: { title: 'Profile' },
      name: 'profile',
      path: '/profile',
    },
    {
      beforeEnter: [auth],
      component: UserView,
      meta: { title: '' },
      name: 'user-view',
      path: '/users/:id',
    },
    {
      beforeEnter: [auth],
      component: ListWorkouts,
      meta: { title: 'Workouts' },
      name: 'list-workouts',
      path: '/workouts',
    },
    {
      beforeEnter: [auth],
      component: ViewWorkout,
      meta: { title: '' },
      name: 'view-workout',
      path: '/workouts/:id',
    },
    {
      beforeEnter: [auth],
      component: WorkoutRoutine,
      meta: { title: '' },
      name: 'workout-routine',
      path: '/workouts/routine/:routine_id',
    },
    {
      beforeEnter: [auth],
      component: ListRoutines,
      meta: { title: 'Routines' },
      name: 'routines',
      path: '/routines',
    },
    {
      beforeEnter: [auth],
      component: CreateRoutine,
      meta: { title: 'Create Routine' },
      name: 'create-routine',
      path: '/routines/create',
    },
    {
      beforeEnter: [auth],
      component: ViewRoutine,
      meta: { title: 'Routine' },
      name: 'routine',
      path: '/routines/:id',
    },
    {
      beforeEnter: [auth],
      component: ListExercises,
      meta: { title: 'Exercises' },
      name: 'exercises',
      path: '/exercises',
    },
    {
      beforeEnter: [auth],
      component: CreateExercise,
      meta: { title: 'Create Exercise' },
      name: 'create-exercise',
      path: '/exercises/create',
    },
    {
      beforeEnter: [auth],
      component: UpdateExercise,
      meta: { title: 'Update Exercise' },
      name: 'update-exercise',
      path: '/exercises/:id/edit',
    },
    {
      beforeEnter: [guest],
      component: UserLogin,
      meta: { title: 'Login' },
      name: 'login',
      path: '/login',
    },
    {
      beforeEnter: [guest],
      component: UserSignup,
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
      component: NotFound,
      meta: { title: 'Not Found' },
      name: 'not-found',
      path: '/:pathMatch(.*)*',
    },
  ],
})

router.beforeEach((to, from, next) => {
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
  await AuthClient.logout(create(LogoutRequestSchema, {}))
  const authStore = useAuthStore()
  authStore.logout()

  const notificationStore = useNotificationStore()
  notificationStore.unreadCount = 0

  return {
    path: '/login',
  }
}

export default router
