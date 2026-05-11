import { test, expect } from '@playwright/test';

import { mockApi, seedAuth, expectRedirectHome } from './helpers/mockApi.js';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('admin can see jobs from multiple branches', async ({ page }) => {
  await seedAuth(page, 'admin');

  await page.goto('/admin');

  await expect(page.getByText('Acme Facilities').first()).toBeVisible();
  await expect(page.getByText('Orbit Mall').first()).toBeVisible();
});

test('branch admin sees their branch jobs only', async ({ page }) => {
  await seedAuth(page, 'branch_admin');

  await page.goto('/admin');

  await expect(page.getByText('Acme Facilities').first()).toBeVisible();
  await expect(page.getByText('Orbit Mall')).toHaveCount(0);
});

test('supervisor sees their branch jobs only', async ({ page }) => {
  await seedAuth(page, 'supervisor');

  await page.goto('/supervisor');

  await expect(page.getByText('Acme Facilities').first()).toBeVisible();
  await expect(page.getByText('Orbit Mall')).toHaveCount(0);
});

test('technician sees only their assigned visit', async ({ page }) => {
  await seedAuth(page, 'technician');

  await page.goto('/technician?tab=today');

  await expect(page.getByText('Deep Cleaning')).toBeVisible();
  await expect(page.getByText('Pest Control')).toHaveCount(0);
});

test('client jobs page shows only the client job', async ({ page }) => {
  await seedAuth(page, 'client');

  await page.goto('/client/jobs');

  await expect(page.getByText('Client AC Service')).toBeVisible();
  await expect(page.getByText('Acme Facilities')).toHaveCount(0);
  await expect(page.getByText('Orbit Mall')).toHaveCount(0);
});

test('admin bookings page can include all branches', async ({ page }) => {
  await seedAuth(page, 'admin');

  await page.goto('/admin/bookings');

  await expect(page.getByText('BK-NORTH')).toBeVisible();
  await expect(page.getByText('BK-SOUTH')).toBeVisible();
  await expect(page.getByText('BK-CLIENT')).toBeVisible();
});

test('branch admin bookings page hides other branch bookings', async ({ page }) => {
  await seedAuth(page, 'branch_admin');

  await page.goto('/admin/bookings');

  await expect(page.getByText('BK-NORTH')).toBeVisible();
  await expect(page.getByText('BK-SOUTH')).toHaveCount(0);
  await expect(page.getByText('Orbit Mall')).toHaveCount(0);
});

test('supervisor bookings page hides other branch bookings', async ({ page }) => {
  await seedAuth(page, 'supervisor');

  await page.goto('/supervisor/bookings');

  await expect(page.getByText('BK-NORTH')).toBeVisible();
  await expect(page.getByText('BK-SOUTH')).toHaveCount(0);
});

test('admin tickets page can include all branches', async ({ page }) => {
  await seedAuth(page, 'admin');

  await page.goto('/admin/tickets');

  await expect(page.getByText('North branch ticket').first()).toBeVisible();
  await expect(page.getByText('South branch ticket').first()).toBeVisible();
  await expect(page.getByText('Client ticket').first()).toBeVisible();
});

test('branch admin tickets page hides other branch and client tickets', async ({ page }) => {
  await seedAuth(page, 'branch_admin');

  await page.goto('/admin/tickets');

  await expect(page.getByText('North branch ticket').first()).toBeVisible();
  await expect(page.getByText('South branch ticket')).toHaveCount(0);
  await expect(page.getByText('Client ticket')).toHaveCount(0);
});

test('client tickets page shows only client tickets', async ({ page }) => {
  await seedAuth(page, 'client');

  await page.goto('/client/tickets');

  await expect(page.getByText('Client ticket').first()).toBeVisible();
  await expect(page.getByText('North branch ticket')).toHaveCount(0);
  await expect(page.getByText('South branch ticket')).toHaveCount(0);
});

test('branch admin cannot open another branch job by direct URL', async ({ page }) => {
  await seedAuth(page, 'branch_admin');

  await page.goto('/admin/jobs/202');

  await expect(page.getByText('Job not found')).toBeVisible();
  await expect(page.getByText('Orbit Mall')).toHaveCount(0);
});

test('branch admin can open their own branch job by direct URL', async ({ page }) => {
  await seedAuth(page, 'branch_admin');

  await page.goto('/admin/jobs/101');

  await expect(page.getByRole('heading', { name: 'Deep Cleaning' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Acme Facilities' })).toBeVisible();
});

test('client cannot open admin pages', async ({ page }) => {
  await seedAuth(page, 'client');

  await page.goto('/admin/bookings');

  await expectRedirectHome(page, 'client');
  await expect(page.getByText('Client Portal')).toBeVisible();
});

test('technician cannot open supervisor pages', async ({ page }) => {
  await seedAuth(page, 'technician');

  await page.goto('/supervisor');

  await expectRedirectHome(page, 'technician');
  await expect(page.getByText('Technician Panel')).toBeVisible();
});

test('technician job page does not show assignment or schedule controls', async ({ page }) => {
  await seedAuth(page, 'technician');

  await page.goto('/technician/jobs/101');

  await expect(page.getByRole('heading', { name: 'Deep Cleaning' })).toBeVisible();
  await expect(page.getByText('Schedule Visit')).toHaveCount(0);
  await expect(page.getByText('Assign Work Order')).toHaveCount(0);
});

test('branch admin assignment modal lists only same-branch people', async ({ page }) => {
  await seedAuth(page, 'branch_admin');

  await page.goto('/admin/jobs/101');
  await page.getByRole('button', { name: 'Supervisor User' }).click();

  await expect(page.getByRole('heading', { name: /Assign Work Order/ })).toBeVisible();
  await expect(page.getByText('Technician User - North Branch')).toBeVisible();
  await expect(page.getByText('South Technician - South Branch')).toHaveCount(0);
  await expect(page.getByText('South Supervisor - South Branch')).toHaveCount(0);
});
