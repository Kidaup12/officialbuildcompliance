import 'server-only'
import index from '@/data/kenya-library.json'
import { createLibrarySearch } from '@/lib/library-search'
import type { LibraryDocument } from '@/types/library'

export const libraryDocuments: LibraryDocument[] = index.documents
export const searchLibrary = createLibrarySearch(libraryDocuments, index.chunks)
