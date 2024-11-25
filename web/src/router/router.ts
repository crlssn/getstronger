import { createRouter, createWebHistory, type Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePageTitleStore } from '@/stores/pageTitle'
import { AuthClient } from '@/clients/clients'
import { LogoutRequest } from '@/pb/api/v1/auth_pb'
import HomeView from '@/ui/HomeView.vue'
import UserLogin from '@/ui/auth/UserLogin.vue'
import UserSignup from '@/ui/auth/UserSignup.vue'
import NotFound from '@/ui/NotFound.vue'
import CreateExercise from '@/ui/exercises/CreateExercise.vue'
import ListExercises from '@/ui/exercises/ListExercises.vue'
import UpdateExercise from '@/ui/exercises/UpdateExercise.vue'
import ListRoutines from '@/ui/routines/ListRoutines.vue'
import ViewRoutine from '@/ui/routines/ViewRoutine.vue'
import CreateRoutine from '@/ui/routines/CreateRoutine.vue'
import WorkoutRoutine from '@/ui/workouts/WorkoutRoutine.vue'
import ListWorkouts from '@/ui/workouts/ListWorkouts.vue'
import ViewWorkout from '@/ui/workouts/ViewWorkout.vue'

const router: Router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/home',
      name: 'home',
      component: HomeView,
      beforeEnter: [auth],
      meta: { title: 'Home' },
    },
    {
      path: '/workouts',
      name: 'list-workouts',
      component: ListWorkouts,
      beforeEnter: [auth],
      meta: { title: 'Workouts' },
    },
    {
      path: '/workouts/:id',
      name: 'view-workout',
      component: ViewWorkout,
      beforeEnter: [auth],
      meta: { title: '' },
    },
    {
      path: '/workouts/routine/:routine_id',
      name: 'workout-routine',
      component: WorkoutRoutine,
      beforeEnter: [auth],
      meta: { title: '' },
    },
    {
      path: '/routines',
      name: 'routines',
      component: ListRoutines,
      beforeEnter: [auth],
      meta: { title: 'Routines' },
    },
    {
      path: '/routines/create',
      name: 'create-routine',
      component: CreateRoutine,
      beforeEnter: [auth],
      meta: { title: 'Create Routine' },
    },
    {
      path: '/routines/:id',
      name: 'routine',
      component: ViewRoutine,
      beforeEnter: [auth],
      meta: { title: 'Routine' },
    },
    {
      path: '/exercises',
      name: 'exercises',
      component: ListExercises,
      beforeEnter: [auth],
      meta: { title: 'Exercises' },
    },
    {
      path: '/exercises/create',
      name: 'create-exercise',
      component: CreateExercise,
      beforeEnter: [auth],
      meta: { title: 'Create Exercise' },
    },
    {
      path: '/exercises/:id/edit',
      name: 'update-exercise',
      component: UpdateExercise,
      beforeEnter: [auth],
      meta: { title: 'Update Exercise' },
    },
    {
      path: '/login',
      name: 'login',
      component: UserLogin,
      beforeEnter: [guest],
      meta: { title: 'Login' },
    },
    {
      path: '/signup',
      name: 'signup',
      component: UserSignup,
      beforeEnter: [guest],
      meta: { title: 'UserSignup' },
    },
    {
      path: '/logout',
      name: 'logout',
      beforeEnter: [logout],
      component: null,
      children: [],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFound,
      meta: { title: 'Not Found' },
    },
  ],
})

router.beforeEach((to, from, next) => {
  const pageTitleStore = usePageTitleStore()
  pageTitleStore.setPageTitle(to.meta.title as string)
  next()
})

async function logout() {
  await AuthClient.logout(new LogoutRequest())
  const authStore = useAuthStore()
  authStore.logout()
  return {
    path: '/login',
  }
}

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

export default router
