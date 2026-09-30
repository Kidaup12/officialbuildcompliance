import { DocumentLibrary } from '@/components/library/document-library'
import { libraryDocuments } from '@/lib/kenya-library'

export default function LibraryPage() {
    return <DocumentLibrary documents={libraryDocuments} answersEnabled={Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL)} />
}
