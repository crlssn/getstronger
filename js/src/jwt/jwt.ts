import {Auth} from "@/clients/clients";
import {RefreshTokenRequest} from "@/pb/api/v1/auth_pb";
import {useAuthStore} from "@/stores/auth";

export async function RefreshAccessToken(): Promise<void> {
  const authStore = useAuthStore();
  const response = await Auth.refreshToken(new RefreshTokenRequest());
  authStore.setAccessToken(response.accessToken);
  console.log('refreshed access token');
}

export function ScheduleTokenRefresh(): number {
  const interval = 10 * 60 * 1000; // 10 minutes
  // const interval = 10 * 1000; // 10 seconds
  console.log('scheduling access token refresh');
  return setInterval(async () => {
    try {
      console.log('refreshing access token');
      await RefreshAccessToken();
    } catch (error) {
      console.error('Failed to refresh token:', error);
    }
  }, interval);
}
