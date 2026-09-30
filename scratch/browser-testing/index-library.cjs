/* eslint-disable @typescript-eslint/no-require-imports */
// Rebuild with: npm ci --prefix scratch/browser-testing && node scratch/browser-testing/index-library.cjs
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const canvas = require('@napi-rs/canvas');
Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, ImageData: canvas.ImageData, Path2D: canvas.Path2D });
const root = path.resolve(__dirname, '../..');
const directory = path.join(root, 'reference-documents/kenya');
const titles = {
    'national-building-code-2024': 'National Building Code 2024',
    'physical-and-land-use-planning-act': 'Physical and Land Use Planning Act',
    'development-permission-control-regulations-2021': 'Development Permission and Control Regulations 2021',
    'persons-with-disabilities-act-2025': 'Persons with Disabilities Act 2025',
    'environmental-assessment-audit-regulations-2025': 'Environmental Assessment and Audit Regulations 2025',
    'nairobi-development-control-policy-2026': 'Nairobi Development Control Policy 2026',
    'nairobi-development-ordinances-zones-legacy-guide': 'Nairobi Development Ordinances and Zones — legacy guide',
    'fire-risk-reduction-rules-2007-mirror': 'Fire Risk Reduction Rules 2007 — mirror',
    'public-health-act-2022-edition': 'Public Health Act — 2022 edition',
    'solar-water-heating-regulations-2025': 'Solar Water Heating Regulations 2025',
    'national-construction-authority-regulations-2014': 'National Construction Authority Regulations 2014',
    'nairobi-regularization-unauthorized-developments-act-2025': 'Nairobi Regularization of Unauthorized Developments Act 2025',
};
(async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const manifests = ['sources.json', 'nairobi-sources.json', 'additional-sources.json'].flatMap(file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8').replace(/^\uFEFF/, '')));
    const documents = [], chunks = [];
    for (const source of manifests.filter(s => s.status === 'downloaded' && s.file.endsWith('.pdf'))) {
        const id = source.file.replace(/\.pdf$/, '');
        const bytes = fs.readFileSync(path.join(directory, source.file));
        const hash = crypto.createHash('sha256').update(bytes).digest('hex');
        if (hash.toUpperCase() !== source.sha256.toUpperCase()) throw new Error('Source hash mismatch: ' + id);
        const task = pdfjs.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: path.join(__dirname, 'node_modules/pdfjs-dist/standard_fonts').replaceAll('\\', '/') + '/' });
        const pdf = await task.promise;
        let indexedPages = 0;
        const missingPages = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            const page = await pdf.getPage(pageNumber);
            const content = await page.getTextContent();
            const text = content.items.map(item => (item.str || '') + (item.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').trim();
            if (text.replace(/[^a-z]/gi, '').length < 80) { missingPages.push(pageNumber); continue; }
            indexedPages++;
            let part = 0;
            for (let start = 0; start < text.length; start += 2000) {
                chunks.push({ id: `${id}:p${pageNumber}:${++part}`, documentId: id, page: pageNumber, text: text.slice(start, start + 2200) });
            }
        }
        documents.push({ id, title: titles[id] || id, file: source.file, jurisdiction: id.startsWith('nairobi-') ? 'Nairobi' : 'National', sourceUrl: source.source_url, note: source.usage_note || source.purpose, retrievedOn: source.retrieved_on, sha256: hash, pages: pdf.numPages, indexedPages, missingPages, historical: id.includes('legacy'), mirror: id.includes('mirror') });
        console.log(`${id}: indexed ${indexedPages}/${pdf.numPages} pages`);
        await task.destroy();
    }
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.writeFileSync(path.join(root, 'data/kenya-library.json'), JSON.stringify({ version: 1, documents, chunks }));
    console.log(`Saved ${documents.length} documents and ${chunks.length} page-scoped passages.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
