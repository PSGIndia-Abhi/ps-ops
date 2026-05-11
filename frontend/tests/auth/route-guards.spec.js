import { test, expect } from '@playwright/test';

import { mockApi, seedAuth, expectRedirectHome } from '../helpers/mockApi.js';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('protected routes send anonymous users to login', async ({ page }) => {
  await page.goto('/admin');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});

test('root sends an authenticated user to their role home', async ({ page }) => {
  await seedAuth(page, 'supervisor');

  await page.goto('/');

  await expectRedirectHome(page, 'supervisor');
  await expect(page.getByText('Supervisor Panel')).toBeVisible();
});

test('users cannot open another role area', async ({ page }) => {
  await seedAuth(page, 'client');

  await page.goto('/admin');

  await expectRedirectHome(page, 'client');
  await expect(page.getByText('Client Portal')).toBeVisible();
});
