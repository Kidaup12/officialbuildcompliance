"use client"

import { useEffect, useSyncExternalStore } from "react"
import { useOnboardingStore } from "@/lib/store/onboarding-store"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

const STEPS = [
    {
        target: "body", // General welcome, center screen
        title: "Welcome to BPCA",
        description: "Your intelligent assistant for Building Plan Compliance Analysis. Let's take a quick tour to get you started.",
        position: "center",
    },
    {
        target: "#new-project-btn",
        title: "Create a Project",
        description: "Start by creating a new project. You can organize your analyses into folders or keep them in the main dashboard.",
        position: "bottom-start",
    },
    {
        target: "#projects-grid",
        title: "Manage Analyses",
        description: "Your projects and analyses will appear here. Click on a project to view details, upload plans, and run compliance checks.",
        position: "top",
    },
    {
        target: "body", // Wrap up
        title: "Ready to Start?",
        description: "You're all set! Upload your building plans and let our AI handle the complex regulation checks for you.",
        position: "center",
    },
]

const subscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

export function OnboardingTour() {
    const { isOpen, currentStep, nextStep, prevStep, closeTour, hasSeenOnboarding, startTour } = useOnboardingStore()
    const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)

    // Handle initial auto-start
    useEffect(() => {
        if (!hasSeenOnboarding) {
            // Small delay to ensure UI is ready
            const timer = setTimeout(() => {
                startTour()
            }, 1000)
            return () => clearTimeout(timer)
        }
    }, [hasSeenOnboarding, startTour])

    if (!mounted || !isOpen) return null

    const step = STEPS[currentStep]
    const isLastStep = currentStep === STEPS.length - 1

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
            {/* Optional: Spotlight effect could go here */}

            <Card className={cn("w-[400px] shadow-2xl border-primary/20 relative animate-in fade-in zoom-in-95 duration-300")}>
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2"
                    onClick={closeTour}
                >
                    <X className="h-4 w-4" />
                </Button>

                <CardHeader>
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Step {currentStep + 1} of {STEPS.length}
                        </span>
                    </div>
                    <CardTitle className="text-xl text-primary">{step.title}</CardTitle>
                    <CardDescription className="text-base mt-2">
                        {step.description}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {/* Visual cues or icons could go here */}
                    <div className="flex justify-center py-4">
                        <div className="flex gap-2">
                            {STEPS.map((_, idx) => (
                                <div
                                    key={idx}
                                    className={cn(
                                        "h-2 w-2 rounded-full transition-colors",
                                        idx === currentStep ? "bg-primary" : "bg-muted"
                                    )}
                                />
                            ))}
                        </div>
                    </div>
                </CardContent>

                <CardFooter className="flex justify-between">
                    <Button
                        variant="outline"
                        onClick={prevStep}
                        disabled={currentStep === 0}
                    >
                        Previous
                    </Button>
                    <Button onClick={isLastStep ? closeTour : nextStep}>
                        {isLastStep ? "Get Started" : "Next"}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}
