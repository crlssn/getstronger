// import {ConnectError, type UnaryRequest, type UnaryResponse} from "@connectrpc/connect";
// import {RefreshAccessTokenOrLogout} from "@/jwt/jwt";
// import {useAuthStore} from "@/stores/auth";
//
// export async function RequestWithTokenRefresh<T>(
//   request: UnaryRequest<any, any>
// ): Promise<UnaryResponse<any, T>> {
//   const authStore = useAuthStore();
//   try {
//     const headers = new Headers();
//     headers.set("Authorization", `Bearer ${authStore.accessToken}`);
//     request.header.set('Authorization', `Bearer ${authStore.accessToken}`);
//     return await transport.unary(request);
//   } catch (error) {
//     if (error instanceof ConnectError) {
//       if (error.code === Code.Unauthenticated) {
//         try {
//           await RefreshAccessTokenOrLogout();
//           request.header.set('Authorization', `Bearer ${authStore.accessToken}`);
//           return await transport.unary(request);
//         } catch (refreshError) {
//           throw new Error("Token refresh failed; user may need to re-authenticate");
//         }
//       }
//     }
//     throw error;
//   }
// }
//
// export async function AuthHeader() {
//   const authStore = useAuthStore();
//   const headers = new Headers();
//   headers.set('Authorization', `Bearer ${authStore.accessToken}`);
//   return {headers};
// }
