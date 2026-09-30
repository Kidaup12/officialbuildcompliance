import type { ReportContext } from '@/types/report'

/** Sent to n8n; the workflow must bind this contract into its analysis/output nodes. */
export const REPORT_OUTPUT_CONTRACT = {
    schema_version: 2,
    instructions: [
        'Return one findings array; never key findings only by clause number, because codes can share clause numbers.',
        'Assess every selectedCodes entry independently and preserve the exact code_id on each finding and source.',
        'Fetch original regulations. Record document title, edition, jurisdiction and source URL in sources.',
        'For every finding include a references array with source_id, exact clause and one-based source PDF page. Keep printed_page separate.',
        'For every location flagged include drawing evidence: document, one-based original PDF page, sheet, location and observation.',
        'Retain original document page positions when only a subset of pages is extracted.',
        'Explain observed versus required values, units, calculations, applicability and corrective action.',
        'If a source, page, measurement or applicability cannot be verified, use null and explain the gap. Never invent citations or default to page 1.',
        'Null compliant means not assessed. It is neither compliant nor a proven failure.',
        'Return sources and findings even when multiple codes are selected. Do not discard non-Regulation-prefixed clauses.',
    ],
    shape: {
        schema_version: 2,
        selected_codes: ['<exact selected code ID>'],
        sources: [{ id: '<unique source ID>', code_id: '<selected code ID>', title: '<official title>', edition: '<edition>', jurisdiction: '<jurisdiction>', url: '<official URL>' }],
        findings: [{
            code_id: '<selected code ID>', rule_key: '<clause>', title: '<check and location>',
            compliant: null, severity: '<Critical | High | Medium | Low>',
            requirement: '<applicable requirement>', observed: '<measurement with units>', explanation: '<comparison and reasoning>', recommendation: '<specific correction or evidence needed>',
            references: [{ source_id: '<source ID>', clause: '<exact clause>', pdf_page: null, printed_page: null, excerpt: '<optional short verbatim excerpt>' }],
            evidence: [{ document: '<uploaded filename>', pdf_page: null, sheet: '<drawing sheet>', location: '<room/element/grid>', observation: '<what the drawing actually shows>' }],
        }],
    },
}

export function analysisCallbackUrl(baseUrl: string, context: ReportContext): string {
    const url = new URL('/api/webhooks/analysis-update', baseUrl)
    for (const code of context.selected_codes ?? []) url.searchParams.append('selectedCode', code)
    if (context.document_name) url.searchParams.set('planDocument', context.document_name)
    if (context.requested_pages) url.searchParams.set('planPages', context.requested_pages)
    return url.href
}

export function callbackReportContext(requestUrl: string): ReportContext {
    const params = new URL(requestUrl).searchParams
    return {
        selected_codes: [...new Set(params.getAll('selectedCode').filter(c => c.length <= 120))].slice(0, 30),
        document_name: params.get('planDocument')?.slice(0, 255) || undefined,
        requested_pages: params.get('planPages')?.slice(0, 500) || undefined,
    }
}
