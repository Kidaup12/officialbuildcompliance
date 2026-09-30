import { analysisCallbackUrl, REPORT_OUTPUT_CONTRACT } from '@/lib/report-contract'

// Default n8n webhook URL - hardcoded for all users
const DEFAULT_N8N_WEBHOOK_URL = "https://primary-production-dc95.up.railway.app/webhook/f14c12fc-9d17-4709-b799-3b8724f4c572"

export async function triggerAnalysisWorkflow(
    analysisId: string,
    pdfUrl: string,
    selectedCodes: string[],
    description?: string,
    pageNumbers?: string,
    documentName?: string
) {
    const webhookUrl = DEFAULT_N8N_WEBHOOK_URL

    try {
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                analysisId,
                pdfUrl,
                selectedCodes,
                description,
                pageNumbers,
                documentName,
                reportContract: REPORT_OUTPUT_CONTRACT,
                // Prioritize NEXT_PUBLIC_APP_URL, then VERCEL_URL, then localhost
                callbackUrl: (() => {
                    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
                        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
                    return analysisCallbackUrl(baseUrl, { selected_codes: selectedCodes, document_name: documentName, requested_pages: pageNumbers });
                })(),
            }),
        })

        if (!response.ok) {
            throw new Error(`Failed to trigger workflow: ${response.statusText}`)
        }

        return await response.json()
    } catch (error) {
        console.error("Error triggering analysis workflow:", error)
        throw error
    }
}
