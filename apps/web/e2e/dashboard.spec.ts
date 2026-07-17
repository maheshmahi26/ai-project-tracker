import { test, expect } from '@playwright/test';
import { registerAndCreateOrg } from './helpers';

test.describe('Dashboard', () => {
  test('renders the dashboard shell for a new workspace', async ({ page }) => {
    await registerAndCreateOrg(page, `Dash Org ${Date.now()}`);

    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Widgets mount even with no data yet (empty/loading states are handled).
    await expect(page.getByText('Recent activity')).toBeVisible();
  });
});
