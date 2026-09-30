"use client"

import { useEffect, useRef, useState } from 'react'
import { BookOpen, ExternalLink, Loader2, Send, SlidersHorizontal, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { LibraryAnswer, LibraryDocument } from '@/types/library'

interface Turn { question: string; answer: LibraryAnswer }
const starters = ['What does the building code say about stairways?', 'Where are Nairobi zoning and building-height requirements explained?', 'What documents are needed for development permission?']

export function DocumentLibrary({ documents, answersEnabled }: { documents: LibraryDocument[]; answersEnabled: boolean }) {
    const [selected, setSelected] = useState(() => documents.filter(d => d.indexedPages && !d.historical && !d.mirror).map(d => d.id))
    const [turns, setTurns] = useState<Turn[]>([])
    const [draft, setDraft] = useState('')
    const [sending, setSending] = useState('')
    const [error, setError] = useState('')
    const [activeTurn, setActiveTurn] = useState<number>(-1)
    const [activeCitation, setActiveCitation] = useState('')
    const request = useRef<AbortController | null>(null)
    const end = useRef<HTMLDivElement>(null)
    const input = useRef<HTMLTextAreaElement>(null)
    useEffect(() => () => request.current?.abort(), [])
    useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [turns.length, sending])
    const evidence = turns[activeTurn]?.answer.citations ?? []
    const toggle = (id: string) => setSelected(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id])
    async function ask(question = draft) {
        const trimmed = question.trim()
        if (trimmed.length < 2 || trimmed.length > 1500 || !selected.length || sending) return
        setSending(trimmed); setDraft(''); setError('')
        const controller = new AbortController(); request.current = controller
        const timeout = setTimeout(() => controller.abort(), 35000)
        try {
            // Keep follow-up context within the same document selection.
            const scope = [...selected].sort().join('|')
            const previousQuestions = turns.filter(t => [...t.answer.searchedDocuments].sort().join('|') === scope).slice(-4).map(t => t.question)
            const response = await fetch('/api/library/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ question: trimmed, documentIds: selected, previousQuestions }) })
            if (response.redirected) throw new Error('Your session has expired. Sign in again to continue.')
            const body = await response.json()
            if (!response.ok) throw new Error(body.error || 'Unable to load an answer. Please try again.')
            setTurns(current => [...current, { question: trimmed, answer: body as LibraryAnswer }])
            setActiveTurn(turns.length); setActiveCitation('')
        } catch (e) {
            setError(e instanceof Error && e.name !== 'AbortError' ? e.message : 'The request timed out. Please try again.')
            setDraft(trimmed)
        } finally { clearTimeout(timeout); setSending(''); request.current = null }
    }
    function showCitation(turn: number, id: string) {
        setActiveTurn(turn); setActiveCitation(id)
        // Allow the chosen turn's evidence panel to render before moving to its source.
        requestAnimationFrame(() => document.getElementById(`library-source-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
    }
    return <div className="flex h-full min-h-0 flex-col bg-[#f4f3ed] text-stone-800">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-[#fafaf6] px-6 py-5">
            <div><p className="text-[10px] uppercase tracking-[0.24em] text-stone-500">JengaCheck / Kenyan document library</p><h1 className="mt-1 font-serif text-2xl">Chat with docs &amp; codes</h1><p className="mt-1 text-xs text-stone-500">National requirements and Nairobi references, with the source beside every answer.</p></div>
            <Button variant="outline" size="sm" disabled={Boolean(sending) || !turns.length} onClick={() => { setTurns([]); setActiveTurn(-1); setActiveCitation(''); setError(''); setDraft(''); input.current?.focus() }}><RotateCcw className="mr-2 h-3 w-3" />New conversation</Button>
        </header>
        <details className="shrink-0 border-b border-stone-200 bg-[#fafaf6]">
            <summary className="flex cursor-pointer items-center gap-2 px-6 py-3 text-xs"><SlidersHorizontal className="h-4 w-4" />Choose documents <span className="text-stone-500">{selected.length} selected / {documents.length} available</span></summary>
            <div className="max-h-72 overflow-y-auto px-6 pb-4">
                <div className="mb-3 flex flex-wrap gap-2">{['National', 'Nairobi'].map(region => <Button key={region} variant="outline" size="sm" disabled={Boolean(sending)} onClick={() => setSelected(documents.filter(d => d.jurisdiction === region && d.indexedPages && !d.historical && !d.mirror).map(d => d.id))}>{region} only</Button>)}<Button variant="ghost" size="sm" disabled={Boolean(sending)} onClick={() => setSelected([])}>Clear selection</Button></div>
                <div className="grid gap-3 xl:grid-cols-2">{documents.map(doc => <div key={doc.id} className="rounded border border-stone-200 bg-white p-3 text-xs">
                    <label className="flex items-start gap-2"><input type="checkbox" checked={selected.includes(doc.id)} disabled={!doc.indexedPages || Boolean(sending)} onChange={() => toggle(doc.id)} className="mt-0.5 accent-stone-700" /><span className="font-medium">{doc.title}</span></label>
                    <p className="mt-1 pl-5 text-stone-500">{doc.jurisdiction} · {doc.indexedPages}/{doc.pages} pages searchable{!doc.indexedPages ? ' · Scanned PDF — OCR needed' : doc.indexedPages < doc.pages ? ' · Some pages have no searchable text' : ''}</p>
                    <p className="mt-1 pl-5 leading-relaxed text-stone-500">{doc.note}</p>
                    <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 pl-5 underline underline-offset-2">Open document <ExternalLink className="h-3 w-3" /></a>
                </div>)}</div>
            </div>
        </details>
        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
            <section aria-label="Document conversation" className="flex min-h-[440px] min-w-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                    {!turns.length && !sending && <div className="mx-auto max-w-xl py-5">
                        <BookOpen className="mb-5 h-7 w-7 text-[#92754a]" /><h2 className="font-serif text-3xl">Start with a question.<br />Follow it to the source.</h2>
                        <p className="mt-4 text-sm leading-relaxed text-stone-500">Explore the selected Kenyan documents. Ask about a requirement, compare national and county provisions, or find the relevant pages.</p>
                        <div className="mt-6 space-y-2">{starters.map(q => <button key={q} disabled={!selected.length} onClick={() => { setDraft(q); input.current?.focus() }} className="block w-full rounded border border-stone-200 bg-[#fafaf6] p-3 text-left text-sm hover:border-stone-400 disabled:opacity-50">{q}</button>)}</div>
                    </div>}
                    <div className="mx-auto max-w-2xl space-y-8">{turns.map((turn, index) => <article key={index} className="space-y-4">
                        <div className="ml-auto max-w-[90%] rounded-xl rounded-br-none bg-stone-800 px-4 py-3 text-sm text-stone-50">{turn.question}</div>
                        <div className="rounded border border-stone-200 bg-[#fafaf6] p-5">
                            <p className="mb-4 text-[10px] uppercase tracking-[0.2em] text-stone-500">{turn.answer.mode === 'answer' ? 'Answer from selected documents' : 'Document search'}</p>
                            {turn.answer.paragraphs.map((paragraph, p) => <div key={p} className="mb-4"><p className="whitespace-pre-wrap text-sm leading-7">{paragraph.text}</p><div className="mt-2 flex flex-wrap gap-2">{paragraph.citations.map(id => {
                                const citation = turn.answer.citations.find(c => c.id === id)
                                return citation ? <button key={id} onClick={() => showCitation(index, id)} className="rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-600 hover:border-stone-600">[{turn.answer.citations.indexOf(citation) + 1}] PDF p. {citation.page}</button> : null
                            })}</div></div>)}
                            {turn.answer.notice && <p className="mb-3 text-sm leading-relaxed text-stone-600">{turn.answer.notice}</p>}
                            {turn.answer.citations.length > 0 && <Button variant="outline" size="sm" onClick={() => showCitation(index, turn.answer.citations[0].id)}><BookOpen className="mr-2 h-3 w-3" />View {turn.answer.citations.length} source passages</Button>}
                        </div>
                    </article>)}
                    {sending && <div role="status" className="space-y-4 text-sm"><p className="ml-auto max-w-[90%] rounded-xl bg-stone-800 p-4 text-stone-50">{sending}</p><p className="flex items-center gap-2 text-stone-500"><Loader2 className="h-4 w-4 animate-spin" />Looking through the selected documents…</p></div>}
                    <div ref={end} /></div>
                </div>
                <form className="border-t border-stone-200 bg-[#fafaf6] px-6 py-4" onSubmit={e => { e.preventDefault(); void ask() }}>
                    {!answersEnabled && <p className="mb-2 text-xs text-stone-500">Search mode · Conversational answers are not connected yet.</p>}
                    {!selected.length && <p className="mb-2 text-xs text-[#8a493b]">Choose at least one searchable document to begin.</p>}
                    {error && <p role="alert" className="mb-2 text-sm text-[#8a493b]">{error}</p>}
                    <div className="flex items-end gap-2 rounded-lg border border-stone-300 bg-white p-2"><textarea ref={input} aria-label="Ask about Kenyan documents" placeholder="Ask about a requirement, clause or topic…" rows={2} maxLength={1500} value={draft} disabled={Boolean(sending)} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask() } }} className="min-w-0 flex-1 resize-none p-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-stone-400" /><Button type="submit" aria-label="Send question" disabled={Boolean(sending) || draft.trim().length < 2 || !selected.length} className="bg-stone-800 text-white hover:bg-stone-700"><Send className="h-4 w-4" /></Button></div>
                    <p className="mt-2 text-[10px] leading-relaxed text-stone-500">Use source pages to confirm wording, tables and applicability. This conversation is kept only while this page is open.</p>
                </form>
            </section>
            <aside aria-label="Source passages" className="min-h-[260px] overflow-y-auto border-t border-stone-200 bg-[#fafaf6] p-5 xl:w-[360px] xl:shrink-0 xl:border-l xl:border-t-0 2xl:w-[420px]">
                <div className="mb-5 flex items-center justify-between"><h2 className="font-serif text-xl">Source passages</h2><span className="text-xs text-stone-500">{evidence.length} references</span></div>
                {!evidence.length && <p className="text-sm leading-relaxed text-stone-500">References appear here when you ask a question. Each passage links to its original PDF page.</p>}
                <div className="space-y-4">{evidence.map((citation, i) => <article id={`library-source-${citation.id}`} key={citation.id} className={`scroll-mt-4 border bg-white p-4 ${citation.id === activeCitation ? 'border-[#92754a] shadow-sm' : 'border-stone-200'}`}>
                    <p className="text-[10px] uppercase tracking-wider text-[#92754a]">[{i + 1}] PDF page {citation.page}</p><h3 className="mt-2 font-serif text-lg leading-snug">{citation.title}</h3>
                    <p className="my-3 text-[11px] leading-relaxed text-stone-500">{citation.note}</p>
                    <blockquote className="max-h-60 overflow-y-auto whitespace-pre-wrap border-l border-stone-300 pl-3 text-xs leading-6 text-stone-600">{citation.text}</blockquote>
                    <a href={citation.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs underline underline-offset-4">Open PDF page {citation.page}<ExternalLink className="h-3 w-3" /></a>
                </article>)}</div>
            </aside>
        </div>
    </div>
}
