import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AuthResult,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@ai-projectos/shared';
import { useAuthStore } from '@/stores/auth-store';
import { useOrgStore } from '@/stores/org-store';
import { authApi } from '../api/auth-api';

function useAdoptSession() {
  const setSession = useAuthStore((s) => s.setSession);
  const queryClient = useQueryClient();
  return (result: AuthResult) => {
    setSession(result.user, result.tokens.accessToken);
    // Force fresh org data for the new session.
    void queryClient.invalidateQueries({ queryKey: ['orgs'] });
  };
}

export function useLogin() {
  const adopt = useAdoptSession();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: adopt,
  });
}

export function useRegister() {
  const adopt = useAdoptSession();
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: adopt,
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) => authApi.forgotPassword(input),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: ResetPasswordInput) => authApi.resetPassword(input),
  });
}

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clear);
  const clearOrg = useOrgStore((s) => s.clear);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    // Clear local state regardless of the network result (best-effort revoke).
    onSettled: () => {
      clearAuth();
      clearOrg();
      queryClient.clear();
    },
  });
}
