import { test, expect } from '@playwright/test';

import { mockApi, seedAuth } from './helpers/mockApi.js';

const roles = [
  {
    role: 'admin',
    path: '/admin',
    shell: 'Admin Panel',
    content: 'Acme Facilities',
  },
  {
    role: 'branch_admin',
    path: '/admin',
    shell: 'Admin Panel',
    content: 'Acme Facilities',
  },
  {
    role: 'supervisor',
    path: '/supervisor',
    shell: 'Supervisor Panel',
    content: 'Active Jobs',
  },
  {
    role: 'technician',
    path: '/technician?tab=today',
    shell: 'Technician Panel',
    content: 'Deep Cleaning',
  },
  {
    role: 'client',
    path: '/client',
    shell: 'Client Portal',
    content: 'Overview',
  },
];

for (const { role, path, shell, content } of roles) {
  test(`${role} dashboard renders with mocked API data`, async ({ page }) => {
    await mockApi(page);
    await seedAuth(page, role);

    await page.goto(path);

    await expect(page.getByText(shell)).toBeVisible();
    await expect(page.getByText(content).first()).toBeVisible();
  });
}
