import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getToken,
  setToken,
  clearToken,
  getRefreshToken,
  setRefreshToken,
  clearRefreshToken,
  clearAllTokens,
  apiFetch,
} from './api';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe('token getters/setters', () => {
  it('getToken returns null when not set', () => {
    expect(getToken()).toBeNull();
  });

  it('setToken / getToken round-trips', () => {
    setToken('abc123');
    expect(getToken()).toBe('abc123');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('abc123');
  });

  it('clearToken removes the token', () => {
    setToken('abc123');
    clearToken();
    expect(getToken()).toBeNull();
  });

  it('getRefreshToken returns null when not set', () => {
    expect(getRefreshToken()).toBeNull();
  });

  it('setRefreshToken / getRefreshToken round-trips', () => {
    setRefreshToken('rt_xyz');
    expect(getRefreshToken()).toBe('rt_xyz');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('rt_xyz');
  });

  it('clearRefreshToken removes the refresh token', () => {
    setRefreshToken('rt_xyz');
    clearRefreshToken();
    expect(getRefreshToken()).toBeNull();
  });

  it('clearAllTokens removes both tokens', () => {
    setToken('access');
    setRefreshToken('refresh');
    clearAllTokens();
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});

describe('apiFetch', () => {
  it('adds Authorization header when token is present', async () => {
    setToken('my-token');

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/api/test');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer my-token');
  });

  it('does not add Authorization header when no token', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/api/test');

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBeUndefined();
  });

  it('retries with new token on 401 when refresh succeeds', async () => {
    setToken('expired-token');
    setRefreshToken('valid-refresh');

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/auth/refresh')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ token: 'new-access', refreshToken: 'new-refresh' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response('Unauthorized', { status: 401 }));
      }
      return Promise.resolve(new Response('ok', { status: 200 }));
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await apiFetch('/api/data');

    expect(res.status).toBe(200);
    expect(getToken()).toBe('new-access');
    expect(getRefreshToken()).toBe('new-refresh');
  });

  it('clears tokens when refresh fails', async () => {
    setToken('expired-token');
    setRefreshToken('bad-refresh');

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/auth/refresh')) {
        return Promise.resolve(new Response('Forbidden', { status: 403 }));
      }
      return Promise.resolve(new Response('Unauthorized', { status: 401 }));
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await apiFetch('/api/data');

    expect(res.status).toBe(401);
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('does not attempt refresh when no refresh token exists', async () => {
    setToken('expired-token');

    const mockFetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', mockFetch);

    const res = await apiFetch('/api/data');

    expect(res.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
