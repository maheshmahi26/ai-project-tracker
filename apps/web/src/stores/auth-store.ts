import { create } from 'zustand';
import type { PublicUser } from '@ai-projectos/shared';

/**
 * Session lifecycle:
 * - `idle`     — before the first bootstrap attempt.
 * - `loading`  — a silent refresh is in flight (app boot).
 * - `authenticated` / `unauthenticated` — resolved.
 */
export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  /**
   * Access token is kept **in memory only** — never localStorage. The long-lived
   * refresh token lives in an httpOnly cookie the JS can't read, and a silent
   * refresh on boot re-hydrates this token.
   */
  accessToken: string | null;
  user: PublicUser | null;
  status: AuthStatus;

  setSession: (user: PublicUser, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: PublicUser) => void;
  setStatus: (status: AuthStatus) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: 'idle',

  setSession: (user, accessToken) =>
    set({ user, accessToken, status: 'authenticated' }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  setStatus: (status) => set({ status }),
  clear: () => set({ accessToken: null, user: null, status: 'unauthenticated' }),
}));

/** Non-hook accessor for use outside React (api-client auth wiring). */
export const getAccessToken = (): string | null => useAuthStore.getState().accessToken;
