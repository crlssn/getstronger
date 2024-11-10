import {createConnectTransport} from "@connectrpc/connect-web";
import {AuthService} from "@/pb/api/v1/auth_connect";
import {createClient} from "@connectrpc/connect";

// Initialize transport and client
const transport = createConnectTransport({
  baseUrl: 'https://localhost:1234',
  fetch: (url, options) => {
    // TODO: Include credentials only on refresh token requests.
    return fetch(url, { ...options, credentials: 'include' }); // Add credentials
  },
});
export const Auth = createClient(AuthService, transport);
