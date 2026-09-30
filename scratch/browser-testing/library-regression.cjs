/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
function load(file) {
    const filename = path.join(root, file), mod = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const native = createRequire(filename);
    new Function('require', 'module', 'exports', source)(name => name.startsWith('@/') ? load(name.slice(2) + '.ts') : native(name), mod, mod.exports);
    return mod.exports;
}
const { createLibrarySearch } = load('lib/library-search.ts');
const { validateLibraryAnswer, answerFromLibrary } = load('lib/library-answer.ts');
const index = JSON.parse(fs.readFileSync(path.join(root, 'data/kenya-library.json'), 'utf8'));
const search = createLibrarySearch(index.documents, index.chunks);
const national = 'national-building-code-2024';
const nairobi = 'nairobi-development-control-policy-2026';
(async () => {
    assert.equal(index.documents.length, 12);
    for (const chunk of index.chunks) {
        const doc = index.documents.find(d => d.id === chunk.documentId);
        assert.ok(chunk.page >= 1 && chunk.page <= doc.pages);
        assert.ok(!doc.missingPages.includes(chunk.page));
    }
    const found = search('What does the building code say about stairways?', [national]);
    assert.ok(found.length > 0);
    assert.ok(found.every(c => c.documentId === national && c.url.endsWith('#page=' + c.page)));
    assert.ok(found.every(c => /stair/i.test(c.text)), 'Generic words in the question must not outrank its actual topic');
    const county = search('building height plot coverage density', [nairobi]);
    assert.ok(county.length > 0 && county.every(c => c.documentId === nairobi));
    assert.equal(search('zzzxxyyqqqq', [national]).length, 0);
    assert.equal(search('stairways', []).length, 0);
    assert.equal(index.documents.find(d => d.id.includes('regularization')).indexedPages, 0);
    assert.throws(() => validateLibraryAnswer({ paragraphs: [{ text: 'Invented answer', citations: ['fake-source'] }], limitation: '' }, found));
    assert.throws(() => validateLibraryAnswer({ paragraphs: [{ text: 'Uncited answer', citations: [] }], limitation: '' }, found));
    delete process.env.GEMINI_API_KEY; delete process.env.GEMINI_MODEL;
    assert.equal((await answerFromLibrary('stairs', found, [national], [])).mode, 'passages');
    assert.equal((await answerFromLibrary('unmatched', [], [national], [])).mode, 'no_matches');
    process.env.GEMINI_API_KEY = 'fake-test-key'; process.env.GEMINI_MODEL = 'test-model';
    let sent;
    global.fetch = async (url, options) => {
        sent = JSON.parse(options.body);
        assert.equal(options.headers['x-goog-api-key'], 'fake-test-key');
        assert.ok(!url.includes('fake-test-key'));
        return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ paragraphs: [{ text: 'Review the cited passage.', citations: [found[0].id] }], limitation: '' }) }] } }] });
    };
    assert.equal((await answerFromLibrary('stairs', found, [national], [])).mode, 'answer');
    assert.ok(sent.systemInstruction.parts[0].text.includes('ONLY from the retrieved passages'));
    global.fetch = async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ paragraphs: [{ text: 'Untrusted', citations: ['invented'] }], limitation: '' }) }] } }] });
    assert.equal((await answerFromLibrary('stairs', found, [national], [])).mode, 'passages');
    global.fetch = async () => new Response('Unavailable', { status: 503 });
    assert.equal((await answerFromLibrary('stairs', found, [national], [])).mode, 'passages');
    console.log('Library regression passed: all page bounds, document isolation, real-text retrieval, empty matches, scanned PDF exclusion, citation validation, no-key mode, mocked generation and provider failure.');
})().catch(e => { console.error(e); process.exitCode = 1; });
