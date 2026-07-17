import { test, expect } from '@playwright/test';
import { registerAndCreateOrg } from './helpers';

test.describe('Projects', () => {
  test('create a project and see it in the list', async ({ page }) => {
    await registerAndCreateOrg(page, `Proj Org ${Date.now()}`);

    await page.getByRole('link', { name: 'Projects' }).click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

    const name = `Mobile App ${Date.now()}`;
    await page
      .getByRole('button', { name: /new project|create project/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(name);
    // Key auto-derives from the name; set it explicitly to keep the run deterministic.
    await dialog.getByLabel(/key/i).fill('MOB');
    await dialog.getByRole('button', { name: /create|save/i }).click();

    await expect(page.getByText(name)).toBeVisible();
  });
});
