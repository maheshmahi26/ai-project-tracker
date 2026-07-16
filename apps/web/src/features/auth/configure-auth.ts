import { configureApiAuth } from '@/lib/api-client';
import { getAccessToken, useAuthStore } from '@/stores/auth-store';
import { refreshSession } from './api/auth-api';

/**
 * Side-effect module: connects the token store to {@link apiClient}. Imported once
 * (by AuthBootstrap) so the 401→refresh→retry path is armed before any request.
 */
configureApiAuth({
  getToken: getAccessToken,
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
