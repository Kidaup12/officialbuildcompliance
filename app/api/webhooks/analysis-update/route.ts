import { ANALYSIS_COST } from "@/lib/constants"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { callbackReportContext } from "@/lib/report-contract"
import { asRecord, combineReportPayloads, normalizeReport, reportMetrics } from "@/lib/report-model"

export async function GET() {
    return NextResponse.json({ message: "Webhook is live and using latest code (V2)" })
}

export async function POST(request: Request) {
    try {
        console.log('Webhook received request')
        const body = await request.json()
        console.log('Request body:', { analysisId: body.analysisId, status: body.status, hasResult: !!body.result })

        const { analysisId, status, result } = body

        if (!analysisId || !status) {
            console.error('Missing required fields:', { analysisId, status })
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            )
        }

        // Check environment variables
        const missing = []
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
        
        if (missing.length > 0) {
            console.error('Missing Supabase environment variables:', missing)
            return NextResponse.json(
                { error: `DEBUG_CHECK_V1: Server configuration error: Missing ${missing.join(', ')}` },
                { status: 500 }
            )
        }

        // Use service role key to bypass RLS
        console.log('Creating Supabase client with service role')
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        )

        // Check for error in result
        let finalStatus = status
        let errorMessage = null

        if (Array.isArray(result) && result.length === 1 && typeof result[0]?.output === 'string') {
            try {
                // A JSON output wrapper is a normal n8n result, including an empty assessment.
                JSON.parse(result[0].output.replace(/^```(?:json)?\s*|\s*```$/g, ''))
            } catch {
                finalStatus = "failed"
                errorMessage = result[0].output
            }
        }

        // Update analysis status
        console.log('Updating analysis status:', { analysisId, status: finalStatus })

        // Prepare update data
        const updateData: { status: string; updated_at: string; score?: number | null; violations?: number } = {
            status: finalStatus,
            updated_at: new Date().toISOString(),
        }

        // If completed (and not failed), extract summary data from result
        if (finalStatus === "completed" && result) {
            const callback = callbackReportContext(request.url)
            const supplied = asRecord(asRecord(result).request_context)
            const reportData = {
                schema_version: 2,
                request_context: {
                    ...supplied,
                    selected_codes: callback.selected_codes?.length ? callback.selected_codes : supplied.selected_codes ?? asRecord(result).selected_codes,
                    document_name: callback.document_name ?? supplied.document_name,
                    requested_pages: callback.requested_pages ?? supplied.requested_pages,
                },
                result,
            }
            // Persist first: a completed status must never hide a failed report write.
            const { error: reportError } = await supabase.from('reports').insert({ analysis_id: analysisId, json_report: reportData })
            if (reportError) return NextResponse.json({ error: 'Failed to save report' }, { status: 500 })
            const { data: rows, error: rowsError } = await supabase.from('reports').select('json_report').eq('analysis_id', analysisId)
            if (rowsError) return NextResponse.json({ error: 'Failed to aggregate reports' }, { status: 500 })
            const metrics = reportMetrics(normalizeReport(combineReportPayloads((rows ?? []).map(row => row.json_report))))
            updateData.score = metrics.score
            updateData.violations = metrics.failed
        }

        const { error } = await supabase
            .from("analyses")
            .update(updateData)
            .eq("id", analysisId)

        if (error) {
            console.error("Error updating analysis:", error)
            return NextResponse.json(
                { error: "Failed to update analysis", details: error },
                { status: 500 }
            )
        }
        console.log('Analysis status updated successfully')

        // Refund credits if analysis failed
        if (finalStatus === "failed") {
            console.log('Analysis failed, refunding credits')
            try {
                // Get the analysis to find the user
                const { data: analysisData } = await supabase
                    .from("analyses")
                    .select("project_versions(projects(user_id))")
                    .eq("id", analysisId)
                    .single()

                const version = Array.isArray(analysisData?.project_versions)
                    ? analysisData.project_versions[0] : analysisData?.project_versions
                const project = Array.isArray(version?.projects) ? version.projects[0] : version?.projects

                if (project?.user_id) {
                    const userId = project.user_id

                    // Refund 50 credits
                    const { data: currentCredits } = await supabase
                        .from("user_credits")
                        .select("credits")
                        .eq("user_id", userId)
                        .single()

                    if (currentCredits) {
                        await supabase
                            .from("user_credits")
                            .update({
                                credits: currentCredits.credits + ANALYSIS_COST,
                                updated_at: new Date().toISOString()
                            })
                            .eq("user_id", userId)

                        console.log('Credits refunded successfully')
                    }
                }
            } catch (refundError) {
                console.error('Error refunding credits:', refundError)
                // Don't fail the webhook if refund fails
            }
        }


        // If completed or failed with error message, save the report
        if (finalStatus === "failed" && errorMessage) {
            console.log('Saving report to database')

            const reportData = finalStatus === "failed"
                ? { error: errorMessage }
                : result

            const { error: reportError } = await supabase.from("reports").insert({
                analysis_id: analysisId,
                json_report: reportData,
            })

            if (reportError) {
                console.error("Error saving report:", reportError)
                // Don't fail the request if report save fails
            } else {
                console.log('Report saved successfully')
            }
        }

        console.log('Webhook completed successfully')
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Webhook error:", error)
        return NextResponse.json(
            { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        )
    }
}
