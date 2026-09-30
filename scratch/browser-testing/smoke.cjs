/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.TEST_BASE_URL || 'https://jengacheck.vercel.app';
const output = path.join(__dirname, process.env.TEST_OUTPUT || 'live-results');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  const results = [];
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(12000);
  async function test(name, fn) {
    try { await fn(); results.push({ name, status: 'passed' }); }
    catch (e) { results.push({ name, status: 'failed', error: e.message }); }
    console.log(`${results.at(-1).status}: ${name}`);
  }
  await test('Login page loads', async () => {
    const response = await page.goto(base + '/login');
    assert.equal(response.status(), 200);
    await page.getByRole('button', { name: 'Sign In', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'login-desktop.png'), fullPage: true });
  });
  await test('Email and password labels identify inputs', async () => {
    assert.equal(await page.getByLabel('Email', { exact: true }).count(), 1);
    assert.equal(await page.getByLabel('Password', { exact: true }).count(), 1);
    assert.equal(await page.getByLabel('Email', { exact: true }).evaluate(el => el.tagName), 'INPUT');
  });
  await test('Empty login shows validation', async () => {
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.getByText('Please enter a valid email address', { exact: true }).waitFor();
    await page.getByText('Password must be at least 6 characters', { exact: true }).waitFor();
  });
  await test('Password visibility toggle has an accessible name', async () => {
    const toggle = page.locator('form button[type="button"]');
    assert.match(await toggle.getAttribute('aria-label') || await toggle.innerText(), /password/i);
    await toggle.click();
    assert.equal(await page.locator('input[name="password"]').getAttribute('type'), 'text');
    await toggle.click();
  });
  await test('Rejected login displays error (mocked auth response)', async () => {
    await page.route('**/auth/v1/token**', route => route.fulfill({
      status: 400, contentType: 'application/json',
      body: JSON.stringify({ code: 'invalid_credentials', msg: 'Invalid login credentials' })
    }));
    await page.locator('input[name="email"]').fill('playwright@example.invalid');
    await page.locator('input[name="password"]').fill('not-a-real-password');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.getByText('Invalid login credentials', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Sign In', exact: true }).isEnabled(), true);
  });
  await test('Signup navigation and terms validation', async () => {
    await page.getByRole('link', { name: 'Sign up', exact: true }).click();
    await page.waitForURL('**/signup');
    await page.locator('input[name="name"]').fill('Playwright Test');
    await page.locator('input[name="email"]').fill('playwright@example.invalid');
    await page.locator('input[name="password"]').fill('not-a-real-password');
    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    await page.getByText('You must accept the terms and conditions', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'signup-desktop.png'), fullPage: true });
  });
  await test('Terms page loads', async () => {
    await page.getByRole('link', { name: 'terms and conditions' }).click();
    await page.waitForURL('**/terms');
    assert.match(await page.locator('body').innerText(), /Terms/i);
  });
  await test('Password reset navigation and validation', async () => {
    await page.goto(base + '/login');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await page.waitForURL('**/forgot-password');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    await page.getByText('Please enter a valid email address', { exact: true }).waitFor();
  });
  await test('Signed-out dashboard redirects to login', async () => {
    await page.goto(base + '/dashboard');
    await page.waitForURL('**/login');
  });
  await test('Signed-out home redirects to login', async () => {
    await page.goto(base + '/');
    await page.waitForURL('**/login');
  });
  await test('Mobile auth pages have no horizontal overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ['/login', '/signup', '/forgot-password']) {
      await page.goto(base + route);
      await page.locator('form').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, route);
      await page.screenshot({ path: path.join(output, route.slice(1) + '-mobile.png'), fullPage: true });
    }
  });
  await test('No unhandled browser errors', async () => assert.deepEqual(errors, []));
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ base, testedAt: new Date().toISOString(), results, errors,
    scope: 'Public pages only. Auth rejection mocked; no account created, reset email sent, or analysis submitted.' }, null, 2));
  await browser.close();
  process.exitCode = results.some(r => r.status === 'failed') ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
