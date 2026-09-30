"use client"

import { ProjectHeader } from "@/components/project/project-header"
import { AnalysisTable } from "@/components/project/analysis-table"
import { WizardDialog } from "@/components/analysis/wizard-dialog"
import { useQuery } from "@tanstack/react-query"
import { getProject, getProjectAnalyses } from "@/lib/api"
import { Loader2 } from "lucide-react"
import { useParams, useSearchParams } from "next/navigation"
import { useState } from "react"

import { useRealtimeSubscription } from "@/hooks/use-realtime"

export default function ProjectPage() {
    const params = useParams()
    const searchParams = useSearchParams()
    const projectId = params.id as string
    const [wizardOpen, setWizardOpen] = useState(false)

    useRealtimeSubscription(projectId)

    const autoOpenWizard = searchParams.get("newAnalysis") === "true"
    const handleWizardChange = (open: boolean) => {
        setWizardOpen(open)
        if (autoOpenWizard) {
            const url = new URL(window.location.href)
            url.searchParams.delete("newAnalysis")
            window.history.replaceState({}, "", url.pathname + url.search)
        }
    }

    const { data: project, isLoading: isProjectLoading } = useQuery({
        queryKey: ["project", projectId],
        queryFn: () => getProject(projectId),
    })

    const { data: analyses, isLoading: isAnalysesLoading } = useQuery({
        queryKey: ["project-analyses", projectId],
        queryFn: () => getProjectAnalyses(projectId),
    })

    if (isProjectLoading || isAnalysesLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!project) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                Project not found
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            <div className="p-6">
                <ProjectHeader
                    project={{
                        ...project,
                        createdAt: new Date(project.created_at),
                        updatedAt: new Date(project.updated_at),
                        totalAnalyses: analyses?.length || 0
                    }}
                />

                <div className="mt-8 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold tracking-tight">Analysis History</h2>
                        <WizardDialog open={wizardOpen || autoOpenWizard} onOpenChange={handleWizardChange} />
                    </div>

                    <AnalysisTable
                        projectId={projectId}
                        analyses={analyses?.map(a => ({
                            ...a,
                            createdAt: new Date(a.created_at),
                        })) || []}
                    />
                </div>
            </div>
        </div>
    )
}
