import { configureApiAuth } from '@/lib/api-client';
import { getAccessToken, useAuthStore } from '@/stores/auth-store';
import { useOrgStore } from '@/stores/org-store';
import { refreshSession } from './api/auth-api';

/**
 * Side-effect module: connects the token + active-org stores to {@link apiClient}.
 * Imported once (by AuthBootstrap) so the bearer token, `x-org-id` header, and the
 * 401→refresh→retry path are all armed before any request.
 */
configureApiAuth({
  getToken: getAccessToken,
  getOrgId: () => useOrgStore.getState().activeOrgId,
  onRefresh: async () => {
    const result = await refreshSession();
    if (!result) {
      useAuthStore.getState().clear();
      return false;
    }
    useAuthStore.getState().setSession(result.user, result.tokens.accessToken);
    return true;
  },
});
