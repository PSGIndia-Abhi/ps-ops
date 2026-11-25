import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../config/env';
import { getToken } from '../auth/tokenStorage';

/**
 * Centralized HTTP client. Every API module in src/api/* goes through this —
 * no raw axios/fetch calls scattered in screens or components.
 */
export const httpClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    Accept: 'application/json',
  },
});

/**
 * Attaches `Authorization: Bearer <token>` to every request, mirroring
 * frontend/src/api.js's apiFetch. Requests are never logged with the token
 * present (see the response interceptor below).
 */
httpClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

/**
 * Session-expiry hook. Screens/contexts can subscribe so a 401 anywhere in
 * the app routes back to Login exactly once, instead of every screen having
 * to check for it individually.
 */
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  status?: number;
  code?: string;
  isNetworkError: boolean;
  /** The raw response body, for the rare case a screen needs a field beyond message/code (e.g. the geofence distance). */
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status?: number,
    code?: string,
    isNetworkError = false,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.isNetworkError = isNetworkError;
    this.details = details;
  }
}

httpClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string; message?: string; code?: string } & Record<string, unknown>>) => {
    // Never log token/headers - only status + a safe message.
    if (!error.response) {
      return Promise.reject(
        new ApiError(
          'Unable to connect. Please check your internet connection and try again.',
          undefined,
          undefined,
          true,
        ),
      );
    }

    const { status, data } = error.response;

    if (status === 401) {
      unauthorizedHandler?.();
    }

    const message =
      data?.error || data?.message || `Request failed (${status}). Please try again.`;

    return Promise.reject(new ApiError(message, status, data?.code, false, data));
  },
);
