export interface LibraryDocument {
    id: string
    title: string
    file: string
    jurisdiction: string
    sourceUrl: string
    note: string
    retrievedOn: string
    sha256: string
    pages: number
    indexedPages: number
    missingPages: number[]
    historical: boolean
    mirror: boolean
}
export interface LibraryPassage { id: string; documentId: string; page: number; text: string }
export interface LibraryCitation extends LibraryPassage { title: string; url: string; note: string }
export interface LibraryAnswer {
    mode: 'answer' | 'passages' | 'no_matches'
    paragraphs: { text: string; citations: string[] }[]
    notice: string
    citations: LibraryCitation[]
    searchedDocuments: string[]
}
