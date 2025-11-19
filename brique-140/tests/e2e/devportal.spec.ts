/**
 * BRIQUE 140 — E2E Tests with Playwright
 */

import { test, expect } from '@playwright/test';

test.describe('Developer Portal E2E', () => {
  test('Developer can create app and generate API key', async ({ page }) => {
    // Navigate to dev portal
    await page.goto('http://localhost:3000/dev');

    // Create new app
    await page.click('text=Create app');
    await page.fill('input[name=name]', 'TestApp E2E');
    await page.fill('input[name=description]', 'Test app for E2E testing');
    await page.click('button:has-text("Create")');

    // Verify app appears in list
    await expect(page.locator('text=TestApp E2E')).toBeVisible();

    // Navigate to keys
    await page.click('text=Keys');

    // Generate new API key
    await page.click('text=Generate key');
    await page.selectOption('select[name=environment]', 'test');
    await page.click('button:has-text("Create Key")');

    // Verify key ID is displayed
    const keyPreview = await page.locator('text=ak_test_').textContent();
    expect(keyPreview).toContain('ak_test_');

    // Verify secret warning is shown
    await expect(page.locator('text=copy now')).toBeVisible();
  });

  test('API key rotation works correctly', async ({ page }) => {
    await page.goto('http://localhost:3000/dev');

    // Assume key exists
    await page.click('text=Keys');
    await page.click('button:has-text("Rotate")');

    // Verify new key created
    await expect(page.locator('text=rotated successfully')).toBeVisible();
  });

  test('Playground executes test request', async ({ page }) => {
    await page.goto('http://localhost:3000/dev/playground');

    // Select sample request
    await page.click('text=POST /v1/payments');

    // Execute request
    await page.click('button:has-text("Execute")');

    // Verify response appears
    await expect(page.locator('text=Response')).toBeVisible({ timeout: 5000 });
  });

  test('Usage dashboard shows metrics', async ({ page }) => {
    await page.goto('http://localhost:3000/dev');

    // Navigate to usage
    await page.click('text=Usage');

    // Verify charts are rendered
    await expect(page.locator('canvas')).toBeVisible();

    // Verify metrics are shown
    await expect(page.locator('text=calls')).toBeVisible();
    await expect(page.locator('text=errors')).toBeVisible();
  });
});
