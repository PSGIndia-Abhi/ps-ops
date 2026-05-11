import { test as setup, expect } from '@playwright/test';
import path from 'path';

import { users } from '../fixtures/users.js';

const authFile = (role) =>
  path.join(process.cwd(), `tests/storage/${role}.json`);

async function login(page, user) {
  await page.goto('/login');

  await page.getByPlaceholder(/email/i).fill(user.email);

  await page.getByPlaceholder(/password/i).fill(user.password);

  await page.getByLabel(/terms/i).check();

  await page.getByRole('button', {
    name: /login/i,
  }).click();

  await expect(page).toHaveURL(/dashboard|admin/i);
}

setup('authenticate all roles', async ({ page }) => {
  for (const [role, user] of Object.entries(users)) {
    await login(page, user);

    await page.context().storageState({
      path: authFile(role),
    });

    await page.goto('/logout');
  }
});
