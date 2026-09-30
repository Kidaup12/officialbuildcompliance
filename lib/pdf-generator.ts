import jsPDF from 'jspdf'
import { codeName, normalizeReport, referenceGaps, reportMetrics, sourceLink, statusLabel } from '@/lib/report-model'
import type { Finding, ReportContext } from '@/types/report'

export interface ReportOptions extends ReportContext {
    analysis_id?: string
    generated_at?: string
    sample?: boolean
}

// Restrained, print-friendly palette. Status is always written, never conveyed by color alone.
const palette = { ink: '#252B28', muted: '#69706A', accent: '#92754A', line: '#D8D9D1', paper: '#F6F5EF', danger: '#8A493B' }

/** jsPDF's built-in fonts use WinAnsi; normalize common engineering punctuation. */
function text(value: string): string {
    return value.replace(/[\u2010-\u2015]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
        .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/×/g, 'x').replace(/→/g, '->')
        .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '?')
}

export function generateComplianceReport(input: unknown, projectName = 'Building Plan', options: ReportOptions = {}): jsPDF {
    const report = normalizeReport(input, options)
    const metrics = reportMetrics(report)
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: false })
    const date = new Date(options.generated_at ?? Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    const reference = options.analysis_id ? options.analysis_id.slice(0, 12).toUpperCase() : 'PRELIMINARY REVIEW'
    doc.setProperties({ title: `${projectName} | Compliance review`, subject: 'Building plan assessment and reference register', author: 'JengaCheck', creator: 'JengaCheck' })
    const left = 22, width = 166, bottom = 266
    let y = 0
    let continuation = 'COMPLIANCE REVIEW'
    const sourceNumbers = new Map(report.sources.map((s, i) => [s.id, `S${String(i + 1).padStart(2, '0')}`]))
    const detailPages = new Map<string, number>()
    const indexLinks: { id: string; page: number; y: number; height: number }[] = []

    function font(size = 10, style = 'normal', color = palette.ink, family = 'helvetica') {
        doc.setFont(family, style); doc.setFontSize(size); doc.setTextColor(color)
    }
    function header() {
        font(11, 'bold'); doc.text('JENGACHECK', left, 17)
        font(7.5, 'normal', palette.muted); doc.text('BUILT ENVIRONMENT  /  TECHNICAL REVIEW', 188, 17, { align: 'right' })
        doc.setDrawColor(palette.line); doc.setLineWidth(0.25); doc.line(left, 22, 188, 22)
        y = 34
        if (options.sample) { font(8, 'bold', palette.danger); doc.text('DESIGN SAMPLE - FICTIONAL RULES AND MEASUREMENTS', left, y); y += 10 }
    }
    function newPage(label = continuation) {
        doc.addPage(); header(); font(8, 'bold', palette.accent); doc.text(text(label), left, y); y += 11
    }
    function ensure(height: number) { if (y + height > bottom) newPage() }
    function paragraph(value: string, size = 10, color = palette.ink, style = 'normal', family = 'helvetica', indent = 0) {
        if (size >= 17) y += size * 0.15
        font(size, style, color, family)
        const lines = doc.splitTextToSize(text(value || 'Not supplied.'), width - indent) as string[]
        const lineHeight = size * 0.3528 * 1.48
        for (const line of lines) {
            ensure(lineHeight)
            font(size, style, color, family)
            doc.text(line, left + indent, y)
            y += lineHeight
        }
        y += 2.5
    }
    function section(label: string) {
        ensure(22); y += 3
        paragraph(label.toUpperCase(), 8, palette.accent, 'bold')
        y += 1
    }
    function field(label: string, value: string) { section(label); paragraph(value || 'Not supplied — further evidence required.') }
    function linkedParagraph(value: string, url?: string) {
        font(9, 'normal', palette.muted)
        const lines = doc.splitTextToSize(text(value), width) as string[]
        for (const line of lines) {
            ensure(5); font(9, 'normal', palette.muted); doc.text(line, left, y)
            if (url) doc.link(left, y - 3.4, Math.min(width, doc.getTextWidth(line)), 5, { url })
            y += 5
        }
        y += 2
    }

    header()
    y += 8
    paragraph('BUILDING PLAN ASSESSMENT', 9, palette.accent, 'bold')
    paragraph('Building compliance\nreview.', 30, palette.ink, 'normal', 'times')
    y += 6
    paragraph(projectName, 17, palette.ink, 'normal', 'times')
    paragraph(`${date}   /   ${reference}`, 8, palette.muted)
    y += 8
    doc.setFillColor(palette.paper); doc.rect(left, y - 4, width, 32, 'F')
    const stats = [[metrics.failed, 'ACTION REQUIRED'], [metrics.pending, 'NOT ASSESSED'], [metrics.passed, 'MEETS REQUIREMENT']] as const
    stats.forEach(([value, label], i) => {
        const x = left + 7 + i * 54
        font(23, 'normal', palette.ink, 'times'); doc.text(String(value).padStart(2, '0'), x, y + 8)
        font(7, 'bold', palette.muted); doc.text(label, x, y + 19)
    })
    y += 42
    section('Executive assessment')
    paragraph(metrics.total
        ? `${metrics.total} findings are recorded. ${metrics.failed} require action and ${metrics.pending} could not be assessed. Review the code coverage and reference gaps before relying on any conclusion.`
        : 'No assessable findings were returned. This report does not establish compliance.')
    paragraph(`${metrics.cited} of ${metrics.total} findings contain the required reference fields. Reference completeness is not independent verification of the cited text.`, 9, palette.muted)
    paragraph(metrics.score === null ? 'Assessed-check pass rate: not available.' : `Assessed-check pass rate: ${metrics.score}% (${metrics.passed} of ${metrics.assessed}). ${metrics.pending} unassessed findings are excluded. This is not a building approval.`, 9, palette.muted)
    field('Review scope', `Drawing: ${report.context.document_name || 'Document name not supplied'}\nRequested PDF pages: ${report.context.requested_pages || 'Not recorded'}\nRecorded code selection: ${report.context.selected_codes?.length || 'Not recorded'}`)

    continuation = 'CODE COVERAGE & FINDING INDEX'
    newPage()
    paragraph('Scope & coverage', 26, palette.ink, 'normal', 'times')
    paragraph('Each selected code is assessed independently. Similar clause numbers across different documents remain separate findings.', 10, palette.muted)
    for (const code of report.codes) {
        const findings = report.findings.filter(f => f.code_id === code)
        ensure(28)
        section(codeName(code))
        paragraph(findings.length
            ? `${findings.filter(f => f.compliant === false).length} action required   /   ${findings.filter(f => f.compliant === null).length} not assessed   /   ${findings.filter(f => f.compliant === true).length} meets requirement`
            : 'NO ASSESSMENT RETURNED — coverage incomplete.', 9)
    }
    if (!report.codes.length) paragraph('No code attribution was supplied. Findings are listed as unattributed.', 10, palette.muted)
    if (report.warnings.length) { section('Scope qualifications'); report.warnings.forEach(w => paragraph(w, 9, palette.danger)) }
    section('Finding index')
    paragraph('Select a finding below to jump to its detailed assessment.', 9, palette.muted)
    const ordered = [...report.codes.flatMap(code => report.findings.filter(f => f.code_id === code)), ...report.findings.filter(f => !f.code_id)]
    for (const f of ordered) {
        ensure(20)
        const start = y, page = doc.getNumberOfPages()
        paragraph(`${f.id}  /  ${f.title}`, 10, palette.ink, 'bold')
        paragraph(`${f.code_id ? codeName(f.code_id) : 'Unattributed code'}  /  ${statusLabel(f)}`, 8, palette.muted)
        if (page === doc.getNumberOfPages()) indexLinks.push({ id: f.id, page, y: start - 4, height: y - start })
        doc.setDrawColor(palette.line); doc.line(left, y - 1, 188, y - 1); y += 4
    }

    function findingPage(f: Finding) {
        continuation = `${f.id}  /  DETAILED ASSESSMENT (CONTINUED)`
        newPage(`${f.id}  /  DETAILED ASSESSMENT`)
        detailPages.set(f.id, doc.getNumberOfPages())
        paragraph(f.code_id ? codeName(f.code_id) : 'Code attribution not supplied', 9, palette.accent, 'bold')
        paragraph(f.title, 23, palette.ink, 'normal', 'times')
        paragraph(`${statusLabel(f).toUpperCase()}   /   Priority: ${f.severity}   /   Rule: ${f.rule_key}`, 8, f.compliant === false ? palette.danger : palette.muted, 'bold')
        doc.setDrawColor(palette.line); doc.line(left, y, 188, y); y += 5
        field('01 / Governing requirement', f.requirement)
        section('02 / Rule & source references')
        if (!f.references.length) paragraph('No source citation was supplied. The rule label alone is not a verified reference.', 9, palette.danger)
        for (const r of f.references) {
            const s = report.sources.find(source => source.id === r.source_id)
            paragraph(`[${s ? sourceNumbers.get(s.id) : 'SOURCE MISSING'}] ${s?.title || 'Document not supplied'}${s?.edition ? ` (${s.edition})` : ''}`, 10, palette.ink, 'bold')
            paragraph(`Clause: ${r.clause || 'Not supplied'}   /   Source PDF page: ${r.pdf_page || 'Not supplied'}${r.printed_page ? `   /   Printed page: ${r.printed_page}` : ''}`, 9, palette.muted)
            if (r.excerpt) paragraph(`Source excerpt supplied by analysis: "${r.excerpt}"`, 10, palette.ink, 'italic', 'times')
            const url = s && sourceLink(s, r)
            if (url) linkedParagraph('Open source document at cited PDF page', url)
        }
        field('03 / Drawing evidence', f.observed)
        if (!f.evidence.length) paragraph('No drawing location or PDF page was supplied.', 9, palette.danger)
        for (const e of f.evidence) {
            paragraph(`${e.document || report.context.document_name || 'Document not supplied'}  /  Drawing PDF page: ${e.pdf_page || 'Not supplied'}${e.sheet ? `  /  Sheet: ${e.sheet}` : ''}`, 9, palette.ink, 'bold')
            paragraph(`Location: ${e.location || 'Not supplied'}\nObservation: ${e.observation || 'Not supplied'}`, 9)
        }
        if (f.legacy_page_note) paragraph(`Legacy page note (not a verified PDF index): ${f.legacy_page_note}`, 9, palette.muted)
        field('04 / Assessment & reasoning', f.explanation)
        if (f.room_details) field('Room-specific observations', f.room_details)
        field('05 / Corrective action', f.recommendation || (f.compliant === true ? 'No correction recorded for this check.' : 'A specific corrective action or evidence request was not supplied.'))
        const gaps = referenceGaps(f, report)
        section('Reference completeness')
        paragraph(gaps.length ? `Missing or unresolved: ${gaps.join(', ')}. Confirm these before treating the finding as substantiated.` : 'Required reference fields are present. Confirm the cited edition, clause, page and drawing evidence during professional review.', 9, gaps.length ? palette.danger : palette.muted)
    }
    ordered.forEach(findingPage)
    continuation = 'SOURCE REGISTER & REVIEW NOTES'
    newPage()
    paragraph('The reference record', 26, palette.ink, 'normal', 'times')
    paragraph('Document identities and links below are supplied by the analysis. PDF page positions are counted from 1; printed page labels and drawing sheet numbers are recorded separately.', 10, palette.muted)
    if (!report.sources.length) paragraph('No source documents were supplied with this report.', 10, palette.danger)
    for (const source of report.sources) {
        section(`${sourceNumbers.get(source.id)} / ${source.code_id ? codeName(source.code_id) : 'Unattributed source'}`)
        paragraph(source.title, 13, palette.ink, 'normal', 'times')
        paragraph(`Edition: ${source.edition || 'Not supplied'}  /  Jurisdiction: ${source.jurisdiction || 'Not supplied'}`, 9, palette.muted)
        const used = report.findings.filter(f => f.references.some(r => r.source_id === source.id)).map(f => f.id)
        paragraph(`Referenced by: ${used.join(', ') || 'No findings'}`, 9)
        if (source.url) linkedParagraph(source.url, source.url)
        else paragraph('Source URL not supplied.', 9, palette.danger)
    }
    section('Basis & limitations')
    paragraph('This is a preliminary automated review of the supplied drawing evidence against the recorded codes. A missing dimension, source or assessment is not evidence of compliance. Requirements from different jurisdictions are not combined into a single approval decision. Applicability, editions, site conditions and code conflicts require professional review.', 9, palette.muted)
    paragraph('This report does not replace a registered professional, statutory approval, site inspection or verification of the original regulations.', 9, palette.muted)

    for (const link of indexLinks) {
        const page = detailPages.get(link.id)
        if (page) { doc.setPage(link.page); doc.link(left, link.y, width, link.height, { pageNumber: page }) }
    }
    const count = doc.getNumberOfPages()
    for (let page = 1; page <= count; page++) {
        doc.setPage(page); doc.setDrawColor(palette.line); doc.line(left, 279, 188, 279)
        font(7, 'normal', palette.muted); doc.text(`JENGACHECK  /  ${reference}`, left, 285)
        doc.text(`PRELIMINARY  /  ${String(page).padStart(2, '0')} - ${String(count).padStart(2, '0')}`, 188, 285, { align: 'right' })
    }
    return doc
}

export function downloadComplianceReport(input: unknown, projectName = 'Building Plan', options: ReportOptions = {}) {
    const doc = generateComplianceReport(input, projectName, options)
    const name = projectName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'building-plan'
    doc.save(`jengacheck-${name.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
