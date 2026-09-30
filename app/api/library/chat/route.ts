import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { libraryDocuments, searchLibrary } from '@/lib/kenya-library'
import { answerFromLibrary } from '@/lib/library-answer'

export const runtime = 'nodejs'
export const maxDuration = 30
const inputSchema = z.object({ question: z.string().trim().min(2).max(1500), documentIds: z.array(z.string().max(150)).min(1).max(12), previousQuestions: z.array(z.string().max(1500)).max(4).default([]) }).strict()

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Sign in to use the document library.' }, { status: 401 })
    const raw = await request.text()
    if (raw.length > 12000) return NextResponse.json({ error: 'Your question is too long.' }, { status: 413 })
    let value: unknown
    try { value = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
    const parsed = inputSchema.safeParse(value)
    if (!parsed.success) return NextResponse.json({ error: 'Enter a question and select at least one searchable document.' }, { status: 400 })
    const { question, previousQuestions } = parsed.data
    const ids = [...new Set(parsed.data.documentIds)]
    if (ids.some(id => !libraryDocuments.some(d => d.id === id && d.indexedPages > 0))) return NextResponse.json({ error: 'One or more selected documents are not searchable.' }, { status: 400 })
    const evidence = searchLibrary(question, ids, previousQuestions)
    const answer = await answerFromLibrary(question, evidence, ids, previousQuestions)
    return NextResponse.json(answer, { headers: { 'Cache-Control': 'no-store' } })
}
