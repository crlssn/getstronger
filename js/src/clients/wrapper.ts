import {ConnectError, type UnaryRequest, type UnaryResponse} from "@connectrpc/connect";
import {RefreshAccessToken} from "@/jwt/jwt";

export async function RequestWithTokenRefresh<T>(
  request: UnaryRequest<any, any>
): Promise<UnaryResponse<any, T>> {
  try {
    request.header.set('Authorization', `Bearer ${localStorage.getItem('accessToken')}`);
    return await transport.unary(request);
  } catch (error) {
    if (error instanceof ConnectError) {
      if (error.code === Code.Unauthenticated) {
        try {
          await RefreshAccessToken();
          request.header.set('Authorization', `Bearer ${localStorage.getItem('accessToken')}`);
          return await transport.unary(request);
        } catch (refreshError) {
          throw new Error("Token refresh failed; user may need to re-authenticate");
        }
      }
    }
    throw error;
  }
}
