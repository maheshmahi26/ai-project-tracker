import { expect, type Page } from '@playwright/test';

let counter = 0;

/** Unique, readable email per call so parallel-ish runs never collide. */
export function uniqueEmail(prefix = 'e2e'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@example.com`;
}

export interface Account {
  name: string;
  email: string;
  password: string;
}

/** Registers a brand-new account and creates its first organization. */
export async function registerAndCreateOrg(
  page: Page,
  orgName = `Org ${Date.now()}`,
): Promise<Account> {
  const account: Account = { name: 'Test User', email: uniqueEmail(), password: 'password123' };

  await page.goto('/register');
  await page.getByLabel('Full name').fill(account.name);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // A fresh account has no org → onboarding.
  await page.getByLabel('Organization name').fill(orgName);
  await page.getByRole('button', { name: 'Create organization' }).click();

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  return account;
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Fills the admin "Create a user" form on the Settings → Members section. */
export async function createUserViaSettings(
  page: Page,
  opts: { name?: string; email: string; password: string; role?: string },
): Promise<void> {
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Name').fill(opts.name ?? 'New Teammate');
  await page.getByLabel('Email').fill(opts.email);
  await page.getByLabel('Temporary password').fill(opts.password);
  if (opts.role) await page.selectOption('#new-role', opts.role);
  await page.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByText(opts.email)).toBeVisible();
}

/** Completes the forced first-login password change flow. */
export async function completeForcedPasswordChange(
  page: Page,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await expect(page).toHaveURL(/\/change-password/);
  await page.getByLabel('Current password').fill(currentPassword);
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password').fill(newPassword);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}
