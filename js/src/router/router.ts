import {createRouter, createWebHistory, type RouteLocationNormalized} from 'vue-router'
import HomeView from '@/views/Home.vue'
import LoginView from '@/views/Login.vue'
import Signup from "@/views/Signup.vue";
import NotFound from "@/views/NotFound.vue";
import {useAuthStore} from '@/stores/auth';
import {Auth} from "@/clients/clients";
import {LogoutRequest} from "@/pb/api/v1/auth_pb";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/home',
      name: 'home',
      component: HomeView,
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
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFound,
    },
  ],
})

async function logout() {
  await Auth.logout(new LogoutRequest())
  const authStore = useAuthStore();
  authStore.logout();
  return {
    path: '/login',
  };
}

async function auth(to: RouteLocationNormalized) {
  const authStore = useAuthStore();
  if (!authStore.accessToken) {
    return {
      path: '/login',
      query: {returnUrl: to.href}
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
