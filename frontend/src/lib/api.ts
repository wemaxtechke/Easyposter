import { apiUrl } from './apiUrl';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function clearRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearAllTokens(): void {
  clearToken();
  clearRefreshToken();
}

let refreshPromise: Promise<boolean> | null = null;

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Deduplicates concurrent refresh attempts.
 * Returns true if refresh succeeded, false otherwise.
 */
async function tryRefreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const res = await fetch(apiUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) {
        clearAllTokens();
        return false;
      }
      const data = (await res.json()) as { token?: string; refreshToken?: string };
      if (data.token && data.refreshToken) {
        setToken(data.token);
        setRefreshToken(data.refreshToken);
        return true;
      }
      clearAllTokens();
      return false;
    } catch {
      clearAllTokens();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const headers: HeadersInit = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(apiUrl(url), { ...options, headers });

  if (res.status === 401 && getRefreshToken()) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      const newToken = getToken();
      const retryHeaders: HeadersInit = {
        ...(options.headers as Record<string, string>),
      };
      if (newToken) {
        (retryHeaders as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
      }
      return fetch(apiUrl(url), { ...options, headers: retryHeaders });
    }
  }

  return res;
}
