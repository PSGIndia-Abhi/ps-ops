import { test, expect } from '@playwright/test';

import { mockApi, expectRedirectHome } from '../helpers/mockApi.js';
import { users } from '../fixtures/users.js';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('login requires accepting terms', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login' })).toBeDisabled();

  await page.getByLabel(/terms/i).check();

  await expect(page.getByRole('button', { name: 'Login' })).toBeEnabled();
});

test('admin can log in and is sent to the admin dashboard', async ({ page }) => {
  await page.goto('/login');

  await page.getByPlaceholder(/email/i).fill(users.admin.email);
  await page.getByPlaceholder(/password/i).fill(users.admin.password);
  await page.getByLabel(/terms/i).check();
  await page.getByRole('button', { name: 'Login' }).click();

  await expectRedirectHome(page, 'admin');
  await expect(page.getByText('Admin Panel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Booking' })).toBeVisible();
});

test('shows an alert for invalid credentials', async ({ page }) => {
  await page.goto('/login');

  page.on('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Invalid credentials');
    await dialog.accept();
  });

  await page.getByPlaceholder(/email/i).fill('bad@test.com');
  await page.getByPlaceholder(/password/i).fill('wrong-password');
  await page.getByLabel(/terms/i).check();
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page).toHaveURL(/\/login$/);
});
