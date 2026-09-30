"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Download, Loader2, Share2, FileText, DraftingCompass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { generateComplianceReport, downloadComplianceReport } from '@/lib/pdf-generator'
import { combineReportPayloads, normalizeReport, reportMetrics } from '@/lib/report-model'
import type { NormalizedReport } from '@/types/report'
import { ViolationsSidebar } from './violations-sidebar'
import { PDFViewer } from './pdf-viewer'

export function ResultsView({ analysisId }: { analysisId: string }) {
    const router = useRouter()
    const [supabase] = useState(createClient)
    const [report, setReport] = useState<NormalizedReport | null>(null)
    const [raw, setRaw] = useState<unknown>(null)
    const [projectName, setProjectName] = useState('Building Plan')
    const [projectId, setProjectId] = useState<string>()
    const [originalUrl, setOriginalUrl] = useState<string>()
    const [reportUrl, setReportUrl] = useState<string>()
    const [error, setError] = useState<string>()
    const [notice, setNotice] = useState<string>()
    const [loading, setLoading] = useState(true)
    const [view, setView] = useState<'report' | 'original'>('report')
    const [selectedId, setSelectedId] = useState<string>()
    const [drawingPage, setDrawingPage] = useState<number>()
    const [generatedAt, setGeneratedAt] = useState<string>()

    useEffect(() => {
        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | undefined
        let blobUrl: string | undefined
        let attempts = 0
        let hasReport = false
        let lastPayload = ''
        const poll = async () => {
            try {
                const { data, error: queryError } = await supabase.from('analyses')
                    .select('status, pdf_url, reports(*), project_versions(projects(name), project_id)')
                    .eq('id', analysisId).single()
                if (cancelled) return
                if (queryError) throw queryError
                if (!data) throw new Error('Analysis not found')
                const version = Array.isArray(data.project_versions) ? data.project_versions[0] : data.project_versions
                const project = Array.isArray(version?.projects) ? version.projects[0] : version?.projects
                setProjectName(project?.name || 'Building Plan')
                setProjectId(version?.project_id)
                setOriginalUrl(data.pdf_url ?? undefined)
                if (data.status === 'failed') { setError('The analysis failed. Please return to the project and try again.'); setLoading(false); return }
                if (data.status === 'completed' && data.reports?.length) {
                    const payload = combineReportPayloads(data.reports.map((row: { json_report: unknown }) => row.json_report))
                    const signature = JSON.stringify(payload)
                    const normalized = normalizeReport(payload)
                    const missingCodes = normalized.context.selected_codes?.some(code => !normalized.findings.some(f => f.code_id === code))
                    if (signature !== lastPayload) {
                        const created = new Date().toISOString()
                        const pdf = generateComplianceReport(payload, project?.name || 'Building Plan', { analysis_id: analysisId, generated_at: created })
                        const nextUrl = URL.createObjectURL(pdf.output('blob'))
                        if (blobUrl) URL.revokeObjectURL(blobUrl)
                        blobUrl = nextUrl
                        setRaw(payload); setReport(normalized); setReportUrl(nextUrl); setGeneratedAt(created)
                        setSelectedId(current => normalized.findings.some(f => f.id === current) ? current : normalized.findings[0]?.id)
                        lastPayload = signature
                    }
                    hasReport = true
                    setLoading(false)
                    if (!missingCodes) { setNotice(undefined); return }
                    setNotice('Some selected codes have no attributable results yet. Checking for additional workflow outputs…')
                }
            } catch (err) {
                console.error('Unable to load analysis report:', err)
            }
            if (cancelled) return
            attempts += 1
            if (attempts >= 60) {
                if (hasReport) setNotice('Some selected codes remain incomplete. Review the scope qualifications in the report.')
                else { setError('The report was not available after five minutes. Return to the project and try again.'); setLoading(false) }
                return
            }
            timer = setTimeout(poll, 5000)
        }
        void poll()
        return () => { cancelled = true; if (timer) clearTimeout(timer); if (blobUrl) URL.revokeObjectURL(blobUrl) }
    }, [analysisId, supabase])

    const close = () => router.push(projectId ? `/dashboard/project/${projectId}` : '/dashboard')
    const metrics = report ? reportMetrics(report) : null
    if (loading) return <div className="flex h-screen items-center justify-center bg-stone-50"><div className="text-center space-y-4"><Loader2 className="mx-auto h-8 w-8 animate-spin text-stone-500" /><h1 className="font-serif text-2xl">Preparing your review</h1><p className="text-sm text-stone-500">Gathering findings and document references.</p></div></div>
    if (error) return <div className="flex h-screen items-center justify-center"><div className="max-w-md space-y-4 p-6"><h1 className="font-serif text-2xl">Report unavailable</h1><p>{error}</p><Button onClick={close}>Return to project</Button></div></div>
    if (!report || !metrics) return null

    return (
        <div className="flex h-full min-h-0 flex-col bg-[#eeeee8] text-stone-800">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-[#fafaf6] px-6 py-4">
                <div className="flex min-w-0 items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={close} aria-label="Return to project"><ArrowLeft className="h-4 w-4" /></Button>
                    <div><p className="text-[10px] uppercase tracking-[0.24em] text-stone-500">JengaCheck / Compliance review</p><h1 className="font-serif text-xl">{projectName}</h1></div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={async () => {
                        try { await navigator.clipboard.writeText(window.location.href); setNotice('Report link copied. Recipients must have access to this project.') }
                        catch { setNotice('Unable to copy the link. Copy the address from your browser.') }
                    }}><Share2 className="mr-2 h-4 w-4" />Share</Button>
                    <Button size="sm" className="bg-stone-800 text-white hover:bg-stone-700" onClick={() => downloadComplianceReport(raw, projectName, { analysis_id: analysisId, generated_at: generatedAt })}><Download className="mr-2 h-4 w-4" />Download report</Button>
                </div>
            </header>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-[#fafaf6] px-6 py-3 text-xs">
                <div className="flex flex-wrap gap-5"><span><strong>{metrics.failed}</strong> action required</span><span><strong>{metrics.pending}</strong> not assessed</span><span><strong>{metrics.passed}</strong> meets requirement</span><span className="text-stone-500">{metrics.cited}/{metrics.total} references complete</span></div>
                <div className="flex rounded border border-stone-300 p-1">
                    <Button size="sm" variant={view === 'report' ? 'secondary' : 'ghost'} aria-pressed={view === 'report'} onClick={() => setView('report')}><FileText className="mr-2 h-3 w-3" />Report</Button>
                    <Button size="sm" variant={view === 'original' ? 'secondary' : 'ghost'} aria-pressed={view === 'original'} onClick={() => setView('original')} disabled={!originalUrl}><DraftingCompass className="mr-2 h-3 w-3" />Drawing{drawingPage ? ` · ${drawingPage}` : ''}</Button>
                </div>
            </div>
            {notice && <p role="status" className="border-b border-stone-200 bg-stone-100 px-6 py-2 text-xs text-stone-600">{notice}</p>}
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                <div className="min-h-[340px] min-w-0 flex-1">
                    {view === 'report' && reportUrl ? <iframe src={`${reportUrl}#view=FitH&toolbar=0&navpanes=0`} title="Compliance review PDF" className="h-full min-h-[340px] w-full" /> : originalUrl ? <PDFViewer url={originalUrl} page={drawingPage} /> : <p className="p-8">Original drawing unavailable.</p>}
                </div>
                <aside className="h-[45vh] shrink-0 lg:h-full lg:w-[420px] xl:w-[460px]">
                    <ViolationsSidebar report={report} selectedFindingId={selectedId} onSelectFinding={setSelectedId} onOpenDrawing={originalUrl ? page => { setDrawingPage(page); setView('original') } : undefined} />
                </aside>
            </div>
        </div>
    )
}
