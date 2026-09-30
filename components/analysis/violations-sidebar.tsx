"use client"

import { useState } from 'react'
import { Search, ExternalLink } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { codeName, referenceGaps, sourceLink, statusLabel } from '@/lib/report-model'
import type { NormalizedReport } from '@/types/report'

interface Props {
    report: NormalizedReport
    selectedFindingId?: string
    onSelectFinding: (id: string) => void
    onOpenDrawing?: (page: number) => void
}

export function ViolationsSidebar({ report, selectedFindingId, onSelectFinding, onOpenDrawing }: Props) {
    const [search, setSearch] = useState('')
    const [code, setCode] = useState('all')
    const findings = report.findings.filter(f => (code === 'all' || (code === 'unattributed' ? !f.code_id : f.code_id === code)) &&
        `${f.id} ${f.title} ${f.rule_key} ${f.code_id ? codeName(f.code_id) : ''} ${f.explanation}`.toLowerCase().includes(search.toLowerCase()))
    return <div className="flex h-full flex-col border-l border-stone-200 bg-[#fafaf6]">
        <div className="space-y-3 border-b border-stone-200 p-5">
            <div className="flex justify-between"><h2 className="font-serif text-xl">Finding register</h2><span className="text-xs text-stone-500">{findings.length} findings</span></div>
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-stone-400" /><Input aria-label="Search findings" placeholder="Find a clause, location or issue" value={search} onChange={e => setSearch(e.target.value)} className="border-stone-300 bg-white pl-9" /></div>
            <select aria-label="Filter findings by code" value={code} onChange={e => setCode(e.target.value)} className="w-full rounded border border-stone-300 bg-white p-2 text-xs">
                <option value="all">All codes</option>{report.codes.map(id => <option key={id} value={id}>{codeName(id)}</option>)}
                {report.findings.some(f => !f.code_id) && <option value="unattributed">Unattributed findings</option>}
            </select>
        </div>
        <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-4">
                {report.warnings.map(w => <p key={w} className="border-l-2 border-amber-700/40 bg-stone-100 p-3 text-xs leading-relaxed text-stone-600">{w}</p>)}
                {!findings.length && <p className="p-4 text-sm text-stone-500">No findings match this selection.</p>}
                {findings.map(f => {
                    const expanded = f.id === selectedFindingId
                    const gaps = referenceGaps(f, report)
                    return <article key={f.id} className={`border bg-white ${expanded ? 'border-stone-500 shadow-sm' : 'border-stone-200'}`}>
                        <button className="w-full space-y-2 p-4 text-left" aria-expanded={expanded} onClick={() => onSelectFinding(expanded ? '' : f.id)}>
                            <div className="flex justify-between gap-2 text-[10px] uppercase tracking-wider"><span className="text-stone-500">{f.id}</span><span className={f.compliant === false ? 'text-[#8a493b]' : 'text-stone-500'}>{statusLabel(f)}</span></div>
                            <h3 className="font-serif text-lg leading-snug">{f.title}</h3>
                            <p className="text-xs leading-relaxed text-stone-500">{f.code_id ? codeName(f.code_id) : 'Code attribution missing'} · {f.rule_key}</p>
                            {gaps.length > 0 && <p className="text-[10px] text-[#8a493b]">Reference details incomplete</p>}
                        </button>
                        {expanded && <div className="space-y-5 border-t border-stone-100 px-4 pb-5 pt-4 text-xs leading-relaxed">
                            <div><h4 className="mb-1 font-semibold uppercase tracking-wider text-stone-500">Governing requirement</h4><p className="whitespace-pre-wrap">{f.requirement || 'Not supplied.'}</p></div>
                            <div><h4 className="mb-2 font-semibold uppercase tracking-wider text-stone-500">Rule references</h4>
                                {!f.references.length && <p>No source citation supplied.</p>}
                                {f.references.map((r, i) => {
                                    const source = report.sources.find(s => s.id === r.source_id)
                                    const link = source && sourceLink(source, r)
                                    return <div key={i} className="mb-2 border-l border-stone-300 pl-3"><p className="font-medium">{source?.title || 'Source missing'} {source?.edition && `(${source.edition})`}</p><p>Clause {r.clause || 'not supplied'} · Source PDF p. {r.pdf_page || 'not supplied'}{r.printed_page && ` · Printed p. ${r.printed_page}`}</p>{r.excerpt && <blockquote className="my-2 font-serif italic">{r.excerpt}</blockquote>}{link && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">Open source <ExternalLink className="h-3 w-3" /></a>}</div>
                                })}
                            </div>
                            <div><h4 className="mb-2 font-semibold uppercase tracking-wider text-stone-500">Drawing evidence</h4><p className="whitespace-pre-wrap">{f.observed || 'Observation not supplied.'}</p>
                                {f.evidence.map((e, i) => <div key={i} className="mt-2 border-l border-stone-300 pl-3"><p>{e.document || report.context.document_name || 'Document not supplied'}{e.sheet && ` · Sheet ${e.sheet}`}</p><p>{e.location || 'Location not supplied'}</p><p>{e.observation}</p>{e.pdf_page ? <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" disabled={!onOpenDrawing} onClick={() => onOpenDrawing?.(e.pdf_page!)}>Open drawing PDF page {e.pdf_page}</Button> : <p className="text-stone-500">Drawing PDF page not supplied.</p>}</div>)}
                                {!f.evidence.length && <p className="mt-2 text-stone-500">Drawing location and page not supplied.</p>}
                                {f.legacy_page_note && <p className="mt-2 text-stone-500">Legacy page note: {f.legacy_page_note}. PDF index unverified.</p>}
                            </div>
                            <div><h4 className="mb-1 font-semibold uppercase tracking-wider text-stone-500">Why it was flagged</h4><p className="whitespace-pre-wrap">{f.explanation || 'Reasoning not supplied.'}</p></div>
                            <div><h4 className="mb-1 font-semibold uppercase tracking-wider text-stone-500">Recommended action</h4><p className="whitespace-pre-wrap">{f.recommendation || (f.compliant === true ? 'No correction recorded.' : 'Action not supplied.')}</p></div>
                            <p className="border-t pt-3 text-stone-500">{gaps.length ? `Missing or unresolved: ${gaps.join(', ')}.` : 'Reference fields are complete. The original text still requires professional verification.'}</p>
                        </div>}
                    </article>
                })}
            </div>
        </ScrollArea>
    </div>
}
