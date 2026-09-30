/** Page numbers are one-based PDF positions; printed page labels are separate. */
export interface SourceDocument {
    id: string
    code_id: string
    title: string
    edition?: string
    jurisdiction?: string
    url?: string
}

export interface RuleReference {
    source_id?: string
    clause?: string
    pdf_page?: number
    printed_page?: string
    excerpt?: string
}

export interface DrawingEvidence {
    document?: string
    pdf_page?: number
    sheet?: string
    location?: string
    observation?: string
}

export interface Regulation {
    compliant: boolean | null
    description?: string
    comment?: string
    severity?: string
    required?: string
    proposed?: string | Record<string, unknown>
    recommendation?: string | Record<string, string>
    page_assessed?: string
    object_on_plan?: string
    comments_by_room?: Record<string, { comment?: string; compliance_status?: string }>
}

export interface ComplianceReport {
    summary?: {
        overall_compliance?: boolean | null
        non_compliant_clauses?: string[]
        compliance_score?: number
    }
    [key: string]: unknown
}

export interface ReportContext {
    selected_codes?: string[]
    document_name?: string
    requested_pages?: string
}

export interface Finding {
    id: string
    code_id?: string
    rule_key: string
    title: string
    compliant: boolean | null
    severity: string
    requirement: string
    observed: string
    explanation: string
    recommendation: string
    references: RuleReference[]
    evidence: DrawingEvidence[]
    legacy_page_note?: string
    room_details: string
}

export interface NormalizedReport {
    context: ReportContext
    sources: SourceDocument[]
    findings: Finding[]
    codes: string[]
    warnings: string[]
}

export function isRegulation(value: unknown): value is Regulation {
    return typeof value === 'object' && value !== null && 'compliant' in value &&
        (value.compliant === true || value.compliant === false || value.compliant === null)
}
