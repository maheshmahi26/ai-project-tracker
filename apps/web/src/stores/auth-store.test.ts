import { beforeEach, describe, expect, it } from 'vitest';
import type { PublicUser } from '@ai-projectos/shared';
import { getAccessToken, useAuthStore } from './auth-store';

const user: PublicUser = {
  id: 'u1',
  email: 'a@b.com',
  name: 'Ada',
  provider: 'local',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('auth-store', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, status: 'idle' });
  });

  it('adopts a session and exposes the access token', () => {
    useAuthStore.getState().setSession(user, 'tok-1');
    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.user).toEqual(user);
    expect(getAccessToken()).toBe('tok-1');
  });

  it('clear() drops the token and marks the session unauthenticated', () => {
    useAuthStore.getState().setSession(user, 'tok-1');
    useAuthStore.getState().clear();
    const state = useAuthStore.getState();
    expect(state.status).toBe('unauthenticated');
    expect(state.user).toBeNull();
    expect(getAccessToken()).toBeNull();
  });
});
