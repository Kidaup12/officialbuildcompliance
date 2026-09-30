import { DocumentLibrary } from '@/components/library/document-library'
import { libraryDocuments } from '@/lib/kenya-library'

export const dynamic = 'force-dynamic'

export default function LibraryPage() {
    return <DocumentLibrary documents={libraryDocuments} answersEnabled={Boolean(process.env.OPENROUTER_API_KEY?.trim())} />
}
