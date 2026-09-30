import type { DrawingEvidence, Finding, NormalizedReport, ReportContext, RuleReference, SourceDocument } from '@/types/report'

export const CODE_NAMES: Record<string, string> = {
    'victorian-building-regs-2018-part5': 'Victorian Building Regulations 2018 — Part 5',
    'si-02': 'SI-02 — Building Envelopes', 'si-03': 'SI-03 — Small Second Dwellings',
    'bp-01': 'BP-01 — Building Permits', 'ncc-2022': 'National Construction Code 2022',
    'uk-building-regs-2010': 'UK Building Regulations 2010 — Approved Documents',
    'irc-2021': 'International Residential Code 2021', 'ibc-2021': 'International Building Code 2021',
    'kenya-building-code-2024': 'Kenya National Building Code 2024',
    'nairobi-development-control-2026': 'Nairobi Development Control Policy 2026',
}
export function codeName(id: string) { return CODE_NAMES[id] || id }
export function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function strings(value: unknown): string[] { return list(value).flatMap(v => string(v) ? [string(v)!] : []) }
export function pdfPage(value: unknown): number | undefined {
    const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : NaN
    return Number.isSafeInteger(n) && n > 0 ? n : undefined
}
export function safeSourceUrl(value: unknown): string | undefined {
    try { const url = new URL(String(value)); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined }
    catch { return undefined }
}
export function sourceLink(source: SourceDocument, reference?: RuleReference): string | undefined {
    const value = safeSourceUrl(source.url)
    if (!value) return undefined
    const url = new URL(value)
    if (reference?.pdf_page) url.hash = `page=${reference.pdf_page}`
    return url.href
}
export function readable(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) return value.map(readable).filter(Boolean).join('; ')
    return Object.entries(asRecord(value)).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${readable(v)}`).join('\n')
}

/** Accept flat reports, wrapped regulations, and separate per-code workflow outputs. */
export function normalizeReport(input: unknown, context: ReportContext = {}): NormalizedReport {
    const root = asRecord(input)
    const saved = asRecord(root.request_context)
    const selected = [...new Set(context.selected_codes ?? strings(saved.selected_codes ?? root.selected_codes))]
    const report: NormalizedReport = {
        context: { selected_codes: selected, document_name: context.document_name ?? string(saved.document_name), requested_pages: context.requested_pages ?? string(saved.requested_pages) },
        sources: [], findings: [], codes: [], warnings: [],
    }
    const warn = (message: string) => { if (!report.warnings.includes(message)) report.warnings.push(message) }
    const fingerprints = new Set<string>()
    let scopeCounter = 0

    function visit(payload: unknown, inheritedCode?: string, inheritedSources: SourceDocument[] = [], depth = 0) {
        if (depth > 12) { warn('Some nested report data exceeded the supported depth. Review the original workflow output.'); return }
        if (typeof payload === 'string') {
            try { visit(JSON.parse(payload.replace(/^```(?:json)?\s*|\s*```$/g, '')), inheritedCode, inheritedSources, depth + 1) }
            catch { warn('A workflow output could not be read as structured report data.') }
            return
        }
        if (Array.isArray(payload)) { payload.forEach(p => visit(p, inheritedCode, inheritedSources, depth + 1)); return }
        const obj = asRecord(payload)
        if (!Object.keys(obj).length) return
        const code = string(obj.code_id ?? obj.selected_code) ?? inheritedCode
        const localScope = ++scopeCounter
        const localSources: SourceDocument[] = list(obj.sources).flatMap((item, i) => {
            const src = asRecord(item)
            const title = string(src.title)
            if (!title) return []
            const source: SourceDocument = {
                id: `${localScope}:${string(src.id) ?? `source-${i + 1}`}`,
                code_id: string(src.code_id) ?? code ?? (selected.length === 1 ? selected[0] : ''),
                title, edition: string(src.edition), jurisdiction: string(src.jurisdiction), url: safeSourceUrl(src.url),
            }
            report.sources.push(source)
            return [source]
        })
        const available = [...localSources, ...inheritedSources]
        function add(value: unknown, key: string) {
            const item = asRecord(value)
            if (!('compliant' in item)) return false
            const references: RuleReference[] = list(item.references ?? item.source_references).map(ref => {
                const r = asRecord(ref)
                const id = string(r.source_id)
                const found = available.find(s => s.id.slice(s.id.indexOf(':') + 1) === id)
                return { source_id: found?.id, clause: string(r.clause), pdf_page: pdfPage(r.pdf_page), printed_page: string(r.printed_page), excerpt: string(r.excerpt) }
            })
            const referencedCodes = [...new Set(references.flatMap(r => {
                const id = available.find(s => s.id === r.source_id)?.code_id
                return id ? [id] : []
            }))]
            const codeId = string(item.code_id ?? item.selected_code) ?? code ??
                (referencedCodes.length === 1 ? referencedCodes[0] : selected.length === 1 ? selected[0] : undefined)
            const evidence: DrawingEvidence[] = list(item.evidence ?? item.drawing_references).map(entry => {
                const e = asRecord(entry)
                return { document: string(e.document), pdf_page: pdfPage(e.pdf_page), sheet: string(e.sheet), location: string(e.location), observation: string(e.observation) }
            })
            const legacyPage = readable(item.page_assessed)
            // A free-text legacy page may mean a sheet or printed page, not a PDF index.
            if (!evidence.length && (item.object_on_plan || legacyPage)) evidence.push({ location: string(item.object_on_plan), observation: readable(item.proposed) })
            const finding: Finding = {
                id: '', code_id: codeId, rule_key: string(item.rule_key ?? item.clause ?? item.id) ?? key,
                title: string(item.title ?? item.description) ?? key,
                compliant: item.compliant === true ? true : item.compliant === false ? false : null,
                severity: string(item.severity) ?? 'Not stated', requirement: readable(item.requirement ?? item.required),
                observed: readable(item.observed ?? item.proposed), explanation: readable(item.explanation ?? item.comment),
                recommendation: readable(item.recommendation), references, evidence, legacy_page_note: legacyPage || undefined,
                room_details: readable(item.comments_by_room),
            }
            if (references.some(r => { const s = available.find(s => s.id === r.source_id); return s?.code_id && codeId && s.code_id !== codeId })) warn(`A source for ${finding.rule_key} names a different code. Review its attribution.`)
            const fingerprint = JSON.stringify({ ...finding, references: references.map(r => {
                const source = available.find(s => s.id === r.source_id)
                return { ...r, source_id: source ? { ...source, id: undefined } : undefined }
            }) })
            if (!fingerprints.has(fingerprint)) { fingerprints.add(fingerprint); report.findings.push(finding) }
            return true
        }
        if (add(obj, string(obj.title) ?? 'Finding')) return
        const reserved = new Set(['sources', 'summary', 'disclaimer', 'request_context', 'selected_codes', 'schema_version', 'code_id', 'selected_code', 'error'])
        for (const [key, value] of Object.entries(obj)) {
            if (reserved.has(key)) continue
            if (['findings', 'regulations'].includes(key)) {
                for (const entry of list(value)) if (!add(entry, 'Finding')) visit(entry, code, available, depth + 1)
                if (!Array.isArray(value)) visit(value, code, available, depth + 1)
            } else if (['reports', 'results', 'code_results', 'result', 'output', 'report', 'json_report'].includes(key)) visit(value, code, available, depth + 1)
            else if (!add(value, key) && (selected.includes(key) || key in CODE_NAMES)) visit(value, key, available, depth + 1)
        }
    }
    visit(input)
    report.findings.forEach((f, i) => { f.id = `F-${String(i + 1).padStart(3, '0')}` })
    report.codes = [...new Set([...selected, ...report.findings.flatMap(f => f.code_id ? [f.code_id] : [])])]
    if (report.findings.some(f => !f.code_id)) warn('Some findings have no code attribution. They have not been assigned to any selected code.')
    for (const code of selected) if (!report.findings.some(f => f.code_id === code)) warn(`${codeName(code)} was selected, but no attributable findings were returned. This is not a pass.`)
    for (const code of report.codes) if (selected.length && !selected.includes(code)) warn(`${codeName(code)} appears in the output but was not in the recorded selection.`)
    if (!report.findings.length) warn('No assessable findings were returned. Compliance has not been established.')
    return report
}

export function referenceGaps(finding: Finding, report: NormalizedReport): string[] {
    const gaps: string[] = []
    if (!finding.code_id) gaps.push('code attribution')
    if (!finding.references.length) gaps.push('rule citation')
    for (const ref of finding.references) {
        const source = report.sources.find(s => s.id === ref.source_id)
        if (!source) gaps.push('source document')
        else {
            if (!source.edition) gaps.push('source edition')
            if (!source.url) gaps.push('source link')
            if (!source.code_id || source.code_id !== finding.code_id) gaps.push('source/code match')
        }
        if (!ref.clause) gaps.push('clause')
        if (!ref.pdf_page) gaps.push('source PDF page')
    }
    if (!finding.evidence.length) gaps.push('drawing evidence')
    for (const e of finding.evidence) {
        if (!e.pdf_page) gaps.push('drawing PDF page')
        if (!e.document && !report.context.document_name) gaps.push('drawing document')
        if (!e.location) gaps.push('drawing location')
        if (!e.observation) gaps.push('drawing observation')
    }
    if (!finding.requirement) gaps.push('requirement')
    if (!finding.explanation) gaps.push('explanation')
    return [...new Set(gaps)]
}

export function reportMetrics(report: NormalizedReport) {
    const passed = report.findings.filter(f => f.compliant === true).length
    const failed = report.findings.filter(f => f.compliant === false).length
    const pending = report.findings.length - passed - failed
    const assessed = passed + failed
    return { passed, failed, pending, total: report.findings.length, assessed, score: assessed ? Math.round(100 * passed / assessed) : null,
        cited: report.findings.filter(f => referenceGaps(f, report).length === 0).length }
}
export function statusLabel(finding: Finding) {
    return finding.compliant === true ? 'Meets requirement' : finding.compliant === false ? 'Action required' : 'Not assessed'
}

/** Keep all per-code report rows, including context carried by the callback. */
export function combineReportPayloads(payloads: unknown[]) {
    const contexts = payloads.map(p => asRecord(asRecord(p).request_context))
    const selected = [...new Set(payloads.flatMap((p, i) => strings(contexts[i].selected_codes ?? asRecord(p).selected_codes)))]
    return {
        request_context: {
            selected_codes: selected,
            document_name: contexts.map(c => string(c.document_name)).find(Boolean),
            requested_pages: contexts.map(c => string(c.requested_pages)).find(Boolean),
        },
        results: payloads,
    }
}
