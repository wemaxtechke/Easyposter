import { create } from 'zustand';
import { getToken, setToken, clearToken } from '../lib/api';
import { apiUrl } from '../lib/apiUrl';

export type UserRole = 'user' | 'creator' | 'admin';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
}

interface AuthState {
  user: User | null;
  initState: 'idle' | 'loading' | 'ready';
  initError: string | null;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (email: string, password: string, name?: string) => Promise<{ error?: string }>;
  logout: () => void;
  isAdmin: () => boolean;
  isCreator: () => boolean;
  refreshUser: () => Promise<void>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  initState: 'idle',
  initError: null,

  init: async () => {
    const token = getToken();
    if (!token) {
      set({ initState: 'ready', user: null });
      return;
    }
    set({ initState: 'loading', initError: null });
    try {
      const res = await fetch(apiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { user: User };
        set({
          user: data.user,
          initState: 'ready',
          initError: null,
        });
      } else {
        clearToken();
        set({
          user: null,
          initState: 'ready',
          initError: null,
        });
      }
    } catch {
      clearToken();
      set({
        user: null,
        initState: 'ready',
        initError: null,
      });
    }
  },

  login: async (email, password) => {
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: User;
        token?: string;
      };
      if (!res.ok) {
        return { error: data.error || 'Login failed' };
      }
      if (!data.token || !data.user) {
        return { error: 'Invalid response from server' };
      }
      setToken(data.token);
      set({ user: data.user });
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Login failed' };
    }
  },

  signup: async (email, password, name) => {
    try {
      const res = await fetch(apiUrl('/api/auth/signup'), {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ email, password, name: name || '' }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: User;
        token?: string;
      };
      if (!res.ok) {
        return { error: data.error || 'Registration failed' };
      }
      if (!data.token || !data.user) {
        return { error: 'Invalid response from server' };
      }
      setToken(data.token);
      set({ user: data.user });
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Registration failed' };
    }
  },

  logout: () => {
    clearToken();
    set({ user: null });
  },

  isAdmin: () => get().user?.role === 'admin',
  isCreator: () => get().user?.role === 'creator',
  refreshUser: async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { user: User };
        set({ user: data.user });
      } else {
        clearToken();
        set({ user: null });
      }
    } catch {
      clearToken();
      set({ user: null });
    }
  },
}));
