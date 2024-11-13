import {createRouter, createWebHistory, type RouteLocationNormalized, type Router} from 'vue-router'
import HomeView from '@/views/Home.vue'
import LoginView from '@/views/Auth/Login.vue'
import Signup from "@/views/Auth/Signup.vue";
import NotFound from "@/views/NotFound.vue";
import {useAuthStore} from '@/stores/auth';
import {AuthClient} from "@/clients/clients";
import {LogoutRequest} from "@/pb/api/v1/auth_pb";
import CreateExercise from "@/views/Exercises/CreateExercise.vue";
import ListExercises from "@/views/Exercises/ListExercises.vue";
import UpdateExercise from "@/views/Exercises/UpdateExercise.vue";

const router: Router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/home',
      name: 'home',
      component: HomeView,
      beforeEnter: [auth],
    },
    {
      path: '/exercises',
      name: 'exercises',
      component: ListExercises,
      beforeEnter: [auth],
    },
    {
      path: '/exercises/create',
      name: 'create-exercise',
      component: CreateExercise,
      beforeEnter: [auth],
    },
    {
      path: '/exercises/:id/edit',
      name: 'update-exercise',
      component: UpdateExercise,
      beforeEnter: [auth],
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      beforeEnter: [guest],
    },
    {
      path: '/signup',
      name: 'signup',
      component: Signup,
      beforeEnter: [guest],
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
    },
  ],
})

async function logout() {
  await AuthClient.logout(new LogoutRequest())
  const authStore = useAuthStore();
  authStore.logout();
  return {
    path: '/login',
  };
}

async function auth() {
  const authStore = useAuthStore();
  if (!authStore.accessToken) {
    return {
      path: '/login',
    };
  }
}

async function guest() {
  const authStore = useAuthStore();
  if (authStore.accessToken) {
    return {
      path: '/home',
    };
  }
}

export default router
