import { CapacitorHttp } from '@capacitor/core'

// Inside the Capacitor WebView the page origin is capacitor://localhost (iOS)
// or http://localhost (Android), which makes every API request cross-origin
// and turns the HttpOnly refresh-token cookie into a third-party cookie that
// WKWebView refuses to store reliably. Routing requests through CapacitorHttp
// sidesteps both problems: the request is issued from native code, so CORS
// never applies and the cookie lives in the platform's persistent cookie jar,
// surviving cold starts exactly like a browser session would.
export const nativeFetch: typeof globalThis.fetch = async (input, init) => {
  const headers = new Headers(init?.headers)

  // The native HTTP layer buffers complete responses, but server streaming
  // needs the incremental body that only the WebView's fetch can deliver.
  // Streaming calls authenticate with the Authorization header rather than
  // cookies, so they lose nothing by staying on fetch; they do require the
  // native origins to be listed in the backend's CORS_ALLOWED_ORIGIN.
  const contentType = headers.get('content-type') ?? ''
  if (contentType.startsWith('application/connect')) {
    return fetch(input, init)
  }

  if (init?.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  const response = await CapacitorHttp.request({
    url: input instanceof Request ? input.url : String(input),
    method: init?.method ?? 'GET',
    headers: Object.fromEntries(headers.entries()),
    data: decodeBody(init?.body),
  })

  return new Response(encodeBody(response.data), {
    status: response.status,
    headers: response.headers,
  })
}

// Connect unary requests arrive as JSON-encoded bytes. CapacitorHttp encodes
// plain objects natively, so hand it the parsed value rather than the string,
// which it would serialise a second time.
function decodeBody(body: BodyInit | null | undefined): unknown {
  if (body === null || body === undefined) return undefined
  if (typeof body === 'string') return JSON.parse(body)
  if (ArrayBuffer.isView(body) || body instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(body))
  }

  throw new Error('unsupported request body type for the native transport')
}

// CapacitorHttp parses JSON response bodies into objects, but connect expects
// to read the raw text itself.
function encodeBody(data: unknown): string {
  if (data === null || data === undefined) return ''
  if (typeof data === 'string') return data

  return JSON.stringify(data)
}
