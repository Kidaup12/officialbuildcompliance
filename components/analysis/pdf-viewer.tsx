"use client"

interface PDFViewerProps {
    url: string
    page?: number
}

export function PDFViewer({ url, page }: PDFViewerProps) {
    return <iframe
        src={`${url.split('#')[0]}#${page ? `page=${page}&` : ''}toolbar=1&navpanes=0`}
        className="h-full min-h-[340px] w-full border-0"
        title="Building Plan"
    />
}
