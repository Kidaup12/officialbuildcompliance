import type { LibraryDocument, LibraryPassage, LibraryCitation } from '@/types/library'

const stop = new Set('a an and are as at be by can could do does for from have how i in is it me of on or please should that the their there these this to was what when where which who why will with would you your about tell explain say state according document code regulation kenya kenyan national county building requirement'.split(' '))
function tokens(text: string) {
    return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
        .map(t => t.length > 3 ? t.replace(/s$/, '') : t)
        .map(t => ['stair', 'stairway', 'staircase'].includes(t) ? 'stair' : t)
        .filter(t => t.length > 1 && !stop.has(t))
}

/** Page-preserving lexical retrieval. Rankings are relevance scores, not legal conclusions. */
export function createLibrarySearch(documents: LibraryDocument[], passages: LibraryPassage[]) {
    const rows = passages.map(p => {
        const terms = tokens(p.text), counts = new Map<string, number>()
        for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1)
        return { passage: p, counts, length: terms.length }
    })
    const frequency = new Map<string, number>()
    for (const row of rows) for (const word of row.counts.keys()) frequency.set(word, (frequency.get(word) ?? 0) + 1)
    const average = rows.reduce((total, r) => total + r.length, 0) / (rows.length || 1)
    return (question: string, documentIds: string[], previousQuestions: string[] = []): LibraryCitation[] => {
        const terms = [...new Set(tokens(question))]
        // Follow-ups can reuse the previous question, without trusting earlier generated answers as evidence.
        const previous = terms.length < 4 ? [...new Set(tokens(previousQuestions.at(-1) ?? ''))].filter(t => !terms.includes(t)) : []
        if (!terms.length) return []
        const ranked = rows.filter(r => documentIds.includes(r.passage.documentId)).map(row => {
            let score = 0, matches = 0
            for (const term of [...terms, ...previous]) {
                const tf = row.counts.get(term) ?? 0
                if (!tf) continue
                if (terms.includes(term)) matches++
                const idf = Math.log(1 + (rows.length - (frequency.get(term) ?? 0) + 0.5) / ((frequency.get(term) ?? 0) + 0.5))
                score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * row.length / average)) * (terms.includes(term) ? 1 : 0.3)
            }
            return { passage: row.passage, score: matches ? score : 0 }
        }).filter(r => r.score > 0).sort((a, b) => b.score - a.score || a.passage.id.localeCompare(b.passage.id))
        const selected: LibraryCitation[] = [], perDoc = new Map<string, number>(), pages = new Set<string>()
        for (const row of ranked) {
            const p = row.passage, pageKey = `${p.documentId}:${p.page}`
            if (pages.has(pageKey) || (perDoc.get(p.documentId) ?? 0) >= (documentIds.length > 1 ? 3 : 8)) continue
            const doc = documents.find(d => d.id === p.documentId)!
            const url = new URL(doc.sourceUrl); url.hash = `page=${p.page}`
            selected.push({ ...p, title: doc.title, url: url.href, note: doc.note })
            pages.add(pageKey); perDoc.set(p.documentId, (perDoc.get(p.documentId) ?? 0) + 1)
            if (selected.length === 8) break
        }
        return selected
    }
}
