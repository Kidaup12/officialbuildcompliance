/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { payloads, context: reportContext } = require('./fixture.cjs');
const output = path.join(__dirname, 'local-results');
const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'local-test@example.org', app_metadata: {}, user_metadata: { full_name: 'Local test' }, created_at: '2026-01-01T00:00:00Z' };
let incomplete = false;
let saved = [];
let lastUpdate;
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:54321');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.end(); return; }
    const body = [];
    for await (const chunk of req) body.push(chunk);
    const raw = Buffer.concat(body).toString();
    const json = raw ? JSON.parse(raw) : {};
    if (url.pathname === '/auth/v1/user') return res.end(JSON.stringify(user));
    if (url.pathname === '/rest/v1/analyses' && req.method === 'PATCH') { lastUpdate = json; return res.end('{}'); }
    if (url.pathname === '/rest/v1/reports') {
        if (req.method === 'POST') { saved.push(json); res.statusCode = 201; return res.end('{}'); }
        return res.end(JSON.stringify(saved));
    }
    if (url.pathname === '/rest/v1/analyses') return res.end(JSON.stringify({ status: 'completed', pdf_url: 'http://127.0.0.1:54321/plan.pdf', reports: (incomplete ? payloads.slice(0, 1) : payloads).map(json_report => ({ json_report })), project_versions: { project_id: 'local-project', projects: { name: 'Nairobi / Design demonstration' } } }));
    if (url.pathname === '/rest/v1/user_credits') return res.end('{"credits":1000}');
    if (url.pathname === '/plan.pdf') { res.setHeader('Content-Type', 'application/pdf'); return res.end(fs.readFileSync(path.join(output, 'premium-report-sample.pdf'))); }
    res.end('[]');
});

(async () => {
    await new Promise(resolve => server.listen(54321, '127.0.0.1', resolve));
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const jwt = [ { alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', exp } ].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.') + '.local-test-signature';
        const session = { access_token: jwt, refresh_token: 'local-only', expires_at: exp, expires_in: 3600, token_type: 'bearer', user };
        await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), domain: '127.0.0.1', path: '/' }]);
        const page = await context.newPage();
        const errors = [];
        const results = [];
        page.on('pageerror', e => errors.push(e.message));
        page.setDefaultTimeout(15000);
        const url = 'http://127.0.0.1:3100/dashboard/project/local-project/analysis/local-analysis';
        async function test(name, fn) {
            try { await fn(); results.push({ name, status: 'passed' }); }
            catch (e) { results.push({ name, status: 'failed', error: e.message }); }
            console.log(`${results.at(-1).status}: ${name}`);
        }
        await test('Authenticated report loads all separate code rows', async () => {
            await page.goto(url);
            await page.getByRole('heading', { name: 'Finding register' }).waitFor();
            assert.equal(await page.locator('article').count(), 2);
            await page.getByText('2/2 references complete', { exact: true }).waitFor();
            await page.waitForTimeout(1500); // Chrome's built-in PDF renderer paints after the iframe loads.
            await page.screenshot({ path: path.join(output, 'premium-report-desktop.png'), fullPage: true });
        });
        await test('Clause, source page, printed page and correct source link appear', async () => {
            await page.getByText('Clause 4.2 · Source PDF p. 12 · Printed p. 10', { exact: true }).waitFor();
            assert.equal(await page.getByRole('link', { name: 'Open source' }).getAttribute('href'), 'https://example.org/Sample%20Standard%20A.pdf#page=12');
        });
        await test('Drawing link targets the original PDF page', async () => {
            await page.getByRole('button', { name: 'Open drawing PDF page 3' }).click();
            assert.match(await page.locator('iframe[title="Building Plan"]').getAttribute('src'), /#page=3&/);
            await page.getByRole('button', { name: 'Report', exact: true }).click();
        });
        await test('Filter preserves same-numbered clause in second code', async () => {
            await page.getByLabel('Filter findings by code').selectOption('Sample Standard B');
            assert.equal(await page.locator('article').count(), 1);
            await page.getByRole('button', { name: /Entrance approach/ }).click();
            assert.equal(await page.getByRole('link', { name: 'Open source' }).getAttribute('href'), 'https://example.org/Sample%20Standard%20B.pdf#page=24');
            await page.getByText('Not assessed', { exact: true }).waitFor();
        });
        await test('Finding search and empty state', async () => {
            await page.getByLabel('Search findings').fill('does-not-exist');
            await page.getByText('No findings match this selection.').waitFor();
            await page.getByLabel('Search findings').fill('');
            await page.getByLabel('Filter findings by code').selectOption('all');
        });
        await test('Download produces actual report PDF', async () => {
            const downloaded = page.waitForEvent('download');
            await page.getByRole('button', { name: 'Download report' }).click();
            const download = await downloaded;
            await download.saveAs(path.join(output, 'browser-download.pdf'));
            assert.match(download.suggestedFilename(), /^jengacheck-.*\.pdf$/);
            assert.ok(fs.readFileSync(path.join(output, 'browser-download.pdf'), 'utf8').startsWith('%PDF-'));
        });
        await test('Mobile report has no horizontal overflow', async () => {
            await page.setViewportSize({ width: 390, height: 844 });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({ path: path.join(output, 'premium-report-mobile.png'), fullPage: true });
        });
        await test('Missing selected code is explicitly incomplete', async () => {
            incomplete = true;
            await page.goto(url);
            await page.getByText('Some selected codes have no attributable results yet.', { exact: false }).waitFor();
            await page.getByText(/Sample Standard B was selected, but no attributable findings/).waitFor();
        });
        await test('Webhook accepts JSON output and aggregates both code callbacks', async () => {
            const callback = new URL('http://127.0.0.1:3100/api/webhooks/analysis-update');
            for (const code of reportContext.selected_codes) callback.searchParams.append('selectedCode', code);
            for (const payload of payloads) {
                const response = await context.request.post(callback.href, { data: { analysisId: 'local-analysis', status: 'completed', result: [{ output: JSON.stringify(payload) }] } });
                assert.equal(response.status(), 200, await response.text());
            }
            assert.equal(saved.length, 2);
            assert.equal(lastUpdate.status, 'completed');
            assert.equal(lastUpdate.score, 0);
            assert.equal(lastUpdate.violations, 1);
            assert.deepEqual(saved[0].json_report.request_context.selected_codes, reportContext.selected_codes);
        });
        let libraryAnswer;
        await test('Standalone library opens with searchable and scanned documents', async () => {
            await page.setViewportSize({ width: 1600, height: 1050 });
            await page.goto('http://127.0.0.1:3100/dashboard/library');
            await page.getByRole('heading', { name: 'Chat with docs & codes' }).waitFor();
            await page.getByText('Choose documents', { exact: false }).click();
            const scanned = page.getByRole('checkbox', { name: 'Nairobi Regularization of Unauthorized Developments Act 2025', exact: true });
            assert.ok(await scanned.isDisabled());
            await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
            assert.ok(await page.getByRole('button', { name: 'Send question' }).isDisabled());
            await page.getByRole('checkbox', { name: 'National Building Code 2024', exact: true }).check();
            await page.getByText('Choose documents', { exact: false }).click();
        });
        await test('Library searches real PDF text and displays page-specific links', async () => {
            await page.getByRole('textbox', { name: 'Ask about Kenyan documents' }).fill('What does the building code say about stairways?');
            const response = page.waitForResponse(r => r.url().endsWith('/api/library/chat') && r.request().method() === 'POST');
            await page.getByRole('button', { name: 'Send question' }).click();
            libraryAnswer = await (await response).json();
            assert.ok(libraryAnswer.citations.length > 0);
            assert.ok(libraryAnswer.citations.every(c => c.documentId === 'national-building-code-2024'));
            const panel = page.getByRole('complementary', { name: 'Source passages' });
            await panel.getByRole('link', { name: /Open PDF page/ }).first().waitFor();
            assert.match(await panel.getByRole('link', { name: /Open PDF page/ }).first().getAttribute('href'), /#page=\d+$/);
            await page.screenshot({ path: path.join(output, 'library-desktop.png'), fullPage: true });
        });
        await test('Cited answer buttons select the matching side-panel passage (mocked AI response)', async () => {
            await page.route('**/api/library/chat', route => route.fulfill({ json: { ...libraryAnswer, mode: 'answer', notice: '', paragraphs: [{ text: 'Review the cited passage.', citations: [libraryAnswer.citations[0].id] }] } }));
            await page.getByRole('textbox', { name: 'Ask about Kenyan documents' }).fill('Explain that passage');
            await page.getByRole('button', { name: 'Send question' }).click();
            await page.getByRole('button', { name: /\[1\] PDF p\./ }).click();
            assert.match(await page.locator('[id^="library-source-"]').first().getAttribute('class'), /border-\[#92754a\]/);
            await page.unroute('**/api/library/chat');
        });
        await test('Library API rejects unlisted documents and oversized questions', async () => {
            const endpoint = 'http://127.0.0.1:3100/api/library/chat';
            const invalid = await context.request.post(endpoint, { data: { question: 'stairs', documentIds: ['https://evil.example/private.pdf'] } });
            assert.equal(invalid.status(), 400);
            const oversized = await context.request.post(endpoint, { data: { question: 'x'.repeat(1501), documentIds: ['national-building-code-2024'] } });
            assert.equal(oversized.status(), 400);
            const scanned = await context.request.post(endpoint, { data: { question: 'requirements', documentIds: ['nairobi-regularization-unauthorized-developments-act-2025'] } });
            assert.equal(scanned.status(), 400);
            const anonymous = await browser.newContext();
            const denied = await anonymous.request.post(endpoint, { maxRedirects: 0, data: { question: 'stairs', documentIds: ['national-building-code-2024'] } });
            assert.ok([307, 401].includes(denied.status()));
            if (denied.status() === 307) assert.ok(denied.headers().location.includes('/login'));
            await anonymous.close();
        });
        await test('Library mobile navigation and new conversation', async () => {
            await page.setViewportSize({ width: 390, height: 844 });
            await page.getByRole('link', { name: 'Docs and codes library', exact: true }).waitFor();
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({ path: path.join(output, 'library-mobile.png'), fullPage: true });
            await page.getByRole('button', { name: 'New conversation' }).click();
            assert.equal(await page.locator('[id^="library-source-"]').count(), 0);
        });
        await test('No browser runtime errors', async () => assert.deepEqual(errors, []));
        fs.writeFileSync(path.join(output, 'report-browser.json'), JSON.stringify({ results, errors }, null, 2));
        if (results.some(r => r.status === 'failed')) process.exitCode = 1;
    } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
