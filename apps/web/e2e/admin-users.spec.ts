import { test, expect } from '@playwright/test';
import {
  completeForcedPasswordChange,
  createUserViaSettings,
  login,
  logout,
  registerAndCreateOrg,
  uniqueEmail,
} from './helpers';

test.describe('Admin user management', () => {
  test('admin provisions a user who is forced to change password on first login', async ({
    page,
  }) => {
    await registerAndCreateOrg(page, `Admin Org ${Date.now()}`);

    const email = uniqueEmail('member');
    const tempPassword = 'temp-pass-123';
    await createUserViaSettings(page, { email, password: tempPassword, role: 'developer' });

    await logout(page);

    // The new user signs in with the temp password and is forced to reset it.
    await login(page, email, tempPassword);
    await expect(page.getByText(/temporary password/i)).toBeVisible();
    await completeForcedPasswordChange(page, tempPassword, 'brand-new-pass-1');

    // And the new password sticks across a fresh session.
    await logout(page);
    await login(page, email, 'brand-new-pass-1');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('blocking a member prevents them from signing in', async ({ page }) => {
    await registerAndCreateOrg(page, `Block Org ${Date.now()}`);

    const email = uniqueEmail('blocked');
    const tempPassword = 'temp-pass-123';
    await createUserViaSettings(page, { email, password: tempPassword, role: 'developer' });

    // Block via the member row actions → confirm dialog.
    const row = page.getByRole('row', { name: new RegExp(email) });
    await row.getByRole('button', { name: 'Member actions' }).click();
    await page.getByRole('menuitem', { name: 'Block' }).click();
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    await expect(page.getByText('Blocked', { exact: true })).toBeVisible();

    await logout(page);

    // A blocked account cannot authenticate.
    await login(page, email, tempPassword);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0);
  });
});
