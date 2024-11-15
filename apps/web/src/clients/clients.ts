import {createConnectTransport} from "@connectrpc/connect-web";
import {createClient, type Interceptor} from "@connectrpc/connect";
import {AuthService} from "@/pb/api/v1/auth_connect";
import {ExerciseService} from "@/pb/api/v1/exercise_connect";
import {useAuthStore} from "@/stores/auth";

const logger: Interceptor = (next) => async (req) => {
  console.log(`sending message to ${req.url}`);
  return await next(req);
};

const auth: Interceptor = (next) => async (req) => {
  const authStore = useAuthStore();
  if (authStore.accessToken) {
    req.header.set("Authorization", `Bearer ${authStore.accessToken}`);
  }
  return next(req);
};

const transport = createConnectTransport({
  baseUrl: import.meta.env.VITE_API_URL,
  fetch: (url, options) => {
    // TODO: Include credentials only on refresh token and logout requests.
    return fetch(url, {...options, credentials: 'include'}); // Add credentials
  },
  interceptors: [logger, auth],
});

export const AuthClient = createClient(AuthService, transport);
export const ExerciseClient = createClient(ExerciseService, transport);
