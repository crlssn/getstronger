import { fromJson, toJson, type JsonValue } from '@bufbuild/protobuf'
import { Code, ConnectError, type Interceptor } from '@connectrpc/connect'

import { useAuthStore } from '@/stores/auth'
import { useConnectionStore } from '@/stores/connection'
import { disposableCachePrefix, dropDisposableCache } from '@/stores/persistence'

/**
 * True when a request never reached the backend: the fetch itself failed
 * (offline, DNS, refused connection) or the service answered Unavailable.
 * Everything else is an application error and must surface as usual.
 */
export const isConnectivityError = (error: unknown): boolean => {
  if (error instanceof TypeError) return true
  if (!(error instanceof ConnectError)) return false
  if (error.code === Code.Unavailable) return true
  return error.code === Code.Unknown && error.cause instanceof TypeError
}

/** Removes every cached response, e.g. when the user logs out. */
export const clearOfflineCache = (): void => dropDisposableCache(window.localStorage)

// Reads follow the API's naming convention; anything else is a mutation and
// must never be replayed from storage.
const isReadMethod = (name: string) => /^(Get|List|Search)/.test(name)

// The offline cache keeps one page per list, so follow-up pages bypass it.
const isFirstPage = (message: unknown): boolean => {
  const pagination = (message as { pagination?: { pageToken?: Uint8Array } }).pagination
  return !pagination?.pageToken?.length
}

/**
 * Serves the last successful response of every unary read when the network is
 * unreachable, so the app stays navigable offline with stale data. Responses
 * are keyed per user and request in localStorage, and only the first page of
 * paginated lists is kept. Also feeds observed connectivity into the
 * connection store.
 */
export const offlineCache: Interceptor = (next) => async (req) => {
  if (req.stream || !isReadMethod(req.method.name) || !isFirstPage(req.message)) {
    return next(req)
  }

  const key = [
    disposableCachePrefix + useAuthStore.getState().userId,
    `${req.service.typeName}.${req.method.name}`,
    JSON.stringify(toJson(req.method.input, req.message)),
  ].join(':')

  try {
    const res = await next(req)
    useConnectionStore.getState().setOnline(true)
    if (!res.stream) {
      try {
        window.localStorage.setItem(key, JSON.stringify(toJson(req.method.output, res.message)))
      } catch {
        // A full or unavailable storage only costs the offline fallback.
      }
    }
    return res
  } catch (error) {
    if (!isConnectivityError(error)) throw error

    useConnectionStore.getState().setOnline(false)
    let cached: string | null = null
    try {
      cached = window.localStorage.getItem(key)
    } catch {
      // An unavailable storage means there is nothing to fall back to.
    }
    if (cached === null) throw error

    return {
      stream: false,
      service: req.service,
      method: req.method,
      header: new Headers(),
      trailer: new Headers(),
      message: fromJson(req.method.output, JSON.parse(cached) as JsonValue),
    }
  }
}
