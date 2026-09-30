/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
fs.mkdirSync(path.join(__dirname, 'local-results'), { recursive: true });

// Load the real TypeScript implementation without adding a test runtime dependency.
function load(file) {
    const filename = path.join(root, file);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    const mod = { exports: {} };
    const nativeRequire = createRequire(filename);
    const localRequire = name => name.startsWith('@/') ? load(name.slice(2) + '.ts') : nativeRequire(name);
    new Function('require', 'module', 'exports', compiled)(localRequire, mod, mod.exports);
    return mod.exports;
}

const { generateComplianceReport } = load('lib/pdf-generator.ts');
const { normalizeReport, reportMetrics, referenceGaps, combineReportPayloads, safeSourceUrl } = load('lib/report-model.ts');
const { analysisCallbackUrl, callbackReportContext } = load('lib/report-contract.ts');
const { payloads, context } = require('./fixture.cjs');
const report = {
    summary: { overall_compliance: false, non_compliant_clauses: ['FIRE-1'] },
    'ACCESS-1': { compliant: true, description: 'Accessible entrance', proposed: 'Level access' },
    'FIRE-1': {
        compliant: false, severity: 'High', description: 'Exit width', required: '900 mm',
        proposed: { width: '800 mm' }, comment: 'Exit is too narrow', page_assessed: '2',
        object_on_plan: 'Rear exit', recommendation: { door: 'Widen the exit' },
        comments_by_room: { Hall: { comment: 'Review escape route', compliance_status: 'Non-compliant' } }
    },
    'STAIR-1': { compliant: null, description: 'Stair dimensions', recommendation: 'Provide dimensions' },
    disclaimer: 'Preliminary review',
    metadata: { author: 'Test' }
};
const pdf = generateComplianceReport(report, 'Nairobi Regression Project');
const data = pdf.output();
for (const text of ['%PDF-', 'Nairobi Regression Project', '50%', 'ACCESS-1', 'FIRE-1', 'STAIR-1', 'Widen the exit', 'Review escape route']) {
    assert.ok(data.includes(text), `Missing PDF content: ${text}`);
}
const explicitScore = generateComplianceReport({ ...report, summary: { compliance_score: 75 } }).output();
assert.ok(explicitScore.includes('50%'));
assert.ok(generateComplianceReport({}).output().includes('not available'));
const multi = normalizeReport(combineReportPayloads(payloads));
assert.equal(multi.findings.length, 2);
assert.equal(multi.findings[0].rule_key, multi.findings[1].rule_key);
assert.notEqual(multi.findings[0].code_id, multi.findings[1].code_id);
assert.notEqual(multi.findings[0].references[0].source_id, multi.findings[1].references[0].source_id);
assert.deepEqual(reportMetrics(multi), { passed: 0, failed: 1, pending: 1, total: 2, assessed: 1, score: 0, cited: 2 });
assert.equal(referenceGaps(multi.findings[0], multi).length, 0);
assert.equal(normalizeReport(combineReportPayloads([...payloads, payloads[0]])).findings.length, 2, 'Retries must not duplicate findings');
assert.equal(normalizeReport([{ output: JSON.stringify(payloads[0]) }]).findings.length, 1);
assert.equal(normalizeReport({ regulations: report }).findings.length, 3);
const ambiguous = normalizeReport(report, context);
assert.ok(ambiguous.findings.every(f => !f.code_id));
assert.ok(ambiguous.warnings.some(w => w.includes('was selected')));
assert.equal(ambiguous.findings[1].evidence[0].pdf_page, undefined, 'Legacy page is not a verified PDF index');
assert.equal(safeSourceUrl('javascript:alert(1)'), undefined);
const invalid = structuredClone(payloads[0]);
invalid.findings[0].references[0].pdf_page = -1;
invalid.findings[0].evidence[0].pdf_page = 'Sheet 3';
const gapsReport = normalizeReport(invalid);
assert.ok(referenceGaps(gapsReport.findings[0], gapsReport).includes('source PDF page'));
assert.ok(referenceGaps(gapsReport.findings[0], gapsReport).includes('drawing PDF page'));
assert.deepEqual(callbackReportContext(analysisCallbackUrl('https://example.org', context)), context);
const sample = generateComplianceReport(combineReportPayloads(payloads), 'Nairobi / Design demonstration', { ...context, sample: true, generated_at: '2026-09-30T12:00:00Z', analysis_id: 'DESIGN-SAMPLE' });
const sampleText = sample.output();
assert.ok(sampleText.includes('/URI (https://example.org/Sample%20Standard%20A.pdf#page=12)'));
assert.ok(sampleText.includes('/Dest ['), 'Finding index must contain internal links');
fs.writeFileSync(path.join(__dirname, 'local-results', 'premium-report-sample.pdf'), Buffer.from(sample.output('arraybuffer')));
const long = structuredClone(payloads[0]);
long.findings[0].explanation = 'A long assessment with traceable observations. '.repeat(1000) + '\nEND OF LONG ASSESSMENT';
const longPdf = generateComplianceReport(long, 'Pagination stress test', { sample: true });
assert.ok(longPdf.getNumberOfPages() > 8);
assert.ok(longPdf.output().includes('END OF LONG ASSESSMENT'));
fs.writeFileSync(path.join(__dirname, 'local-results', 'pagination-stress.pdf'), Buffer.from(longPdf.output('arraybuffer')));
fs.writeFileSync(path.join(__dirname, 'local-results', 'report-regression.pdf'), Buffer.from(pdf.output('arraybuffer')));
console.log('Report regression passed: multiple codes, scoped sources, retry deduplication, wrappers, missing codes, invalid pages, legacy compatibility, safe URLs, callback context, derived metrics, PDF links and long pagination.');
