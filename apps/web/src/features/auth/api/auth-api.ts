import type {
  AuthResult,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  PublicUser,
  RegisterInput,
  ResetPasswordInput,
} from '@ai-projectos/shared';
import { apiClient } from '@/lib/api-client';

const API_BASE = '/api/v1';

/**
 * Raw refresh call that bypasses {@link apiClient} on purpose: the client's
 * 401→refresh→retry interceptor must never call back into itself, so the refresh
 * request is a plain fetch. The refresh token travels in the httpOnly cookie
 * (`credentials: 'include'`); we return the new access token + user.
 */
async function rawRefresh(): Promise<AuthResult | null> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
      credentials: 'include',
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json()) as { data: AuthResult };
  return body.data;
}

// Dedupe concurrent refreshes: many in-flight requests can 401 at once, but only
// one network refresh should happen; the rest await the same promise.
let inFlight: Promise<AuthResult | null> | null = null;

export function refreshSession(): Promise<AuthResult | null> {
  if (!inFlight) {
    inFlight = rawRefresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export const authApi = {
  register: (input: RegisterInput): Promise<AuthResult> =>
    apiClient.post<AuthResult>('/auth/register', input),

  login: (input: LoginInput): Promise<AuthResult> =>
    apiClient.post<AuthResult>('/auth/login', input),

  logout: (): Promise<{ success: true }> =>
    apiClient.post<{ success: true }>('/auth/logout', {}),

  me: (): Promise<PublicUser> => apiClient.get<PublicUser>('/auth/me'),

  forgotPassword: (input: ForgotPasswordInput): Promise<{ success: true }> =>
    apiClient.post<{ success: true }>('/auth/forgot-password', input),

  resetPassword: (input: ResetPasswordInput): Promise<{ success: true }> =>
    apiClient.post<{ success: true }>('/auth/reset-password', input),

  changePassword: (input: ChangePasswordInput): Promise<AuthResult> =>
    apiClient.post<AuthResult>('/auth/change-password', input),

  /** Full-page redirect entrypoint for Google OAuth. */
  googleLoginUrl: (): string => `${API_BASE}/auth/google`,
};
