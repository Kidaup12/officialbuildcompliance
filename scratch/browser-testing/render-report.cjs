/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const canvas = require('@napi-rs/canvas');
Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, ImageData: canvas.ImageData, Path2D: canvas.Path2D });
(async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const directory = path.join(__dirname, 'local-results');
    for (const filename of ['premium-report-sample.pdf', 'pagination-stress.pdf']) {
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(directory, filename))), standardFontDataUrl: path.join(__dirname, 'node_modules/pdfjs-dist/standard_fonts').replaceAll('\\', '/') + '/' }).promise;
        let text = '';
        for (let n = 1; n <= pdf.numPages; n++) {
            const page = await pdf.getPage(n);
            const content = await page.getTextContent();
            for (const item of content.items) {
                if (!item.str?.trim()) continue;
                const x = item.transform[4], y = item.transform[5];
                assert.ok(x >= 0 && x + item.width < 600, `${filename} p${n} horizontal overflow: ${item.str}`);
                assert.ok(y >= 20 && y < 820, `${filename} p${n} vertical overflow: ${item.str}`);
            }
            text += content.items.map(i => i.str || '').join(' ') + '\n';
            if (filename === 'premium-report-sample.pdf' && [1, 2, 3, pdf.numPages].includes(n)) {
                const viewport = page.getViewport({ scale: 1.5 });
                const target = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
                await page.render({ canvasContext: target.getContext('2d'), viewport }).promise;
                fs.writeFileSync(path.join(directory, `premium-page-${n}.png`), target.toBuffer('image/png'));
            }
        }
        if (filename.includes('stress')) assert.ok(text.includes('END OF LONG ASSESSMENT'));
        console.log(`${filename}: ${pdf.numPages} pages; text bounds checked on every page.`);
        await pdf.cleanup();
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
