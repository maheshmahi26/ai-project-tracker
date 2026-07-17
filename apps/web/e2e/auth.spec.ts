import { test, expect } from '@playwright/test';
import { login, logout, registerAndCreateOrg } from './helpers';

test.describe('Auth journey', () => {
  test('register → onboarding → app, then logout and log back in', async ({ page }) => {
    const account = await registerAndCreateOrg(page);

    // Session lands on the dashboard with the app shell chrome.
    await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible();

    await logout(page);
    await login(page, account.email, account.password);

    // Returning user already has an org → straight into the app.
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('rejects invalid credentials', async ({ page }) => {
    await login(page, 'nobody@example.com', 'wrong-password');
    await expect(page).toHaveURL(/\/login/);
  });
});
