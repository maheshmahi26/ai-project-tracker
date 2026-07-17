import { test, expect } from '@playwright/test';
import {
  completeForcedPasswordChange,
  createUserViaSettings,
  login,
  logout,
  registerAndCreateOrg,
  uniqueEmail,
} from './helpers';

test.describe('RBAC', () => {
  test('a developer cannot manage members', async ({ page }) => {
    await registerAndCreateOrg(page, `RBAC Org ${Date.now()}`);

    const email = uniqueEmail('dev');
    const tempPassword = 'temp-pass-123';
    await createUserViaSettings(page, { email, password: tempPassword, role: 'developer' });

    await logout(page);
    await login(page, email, tempPassword);
    await completeForcedPasswordChange(page, tempPassword, 'brand-new-pass-1');

    await page.getByRole('link', { name: 'Settings' }).click();

    // Developers lack `manage:users`: the create form is replaced by a notice.
    await expect(page.getByText(/manage:users permission/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create user' })).toHaveCount(0);
  });
});
