import { cn } from "@/lib/utils/misc";

interface PageStepperProps {
  steps: string[];
  currentStep: number;
}

export function PageStepper({ steps, currentStep }: PageStepperProps) {
  return (
    <div className="flex items-center w-full max-w-4xl mx-auto">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isCompleted = stepNumber < currentStep;

        return (
          <div key={label} className="flex items-center flex-1">
            <div className="flex items-center flex-shrink-0">
              <div
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {stepNumber}
              </div>

              <span
                className={cn(
                  "ml-2 text-sm hidden sm:inline whitespace-nowrap",
                  isActive
                    ? "text-foreground font-medium"
                    : isCompleted
                      ? "text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>

            {stepNumber < steps.length && (
              <div
                className={cn(
                  "h-px mx-2 flex-1 min-w-[1rem]",
                  stepNumber < currentStep ? "bg-primary" : "bg-muted",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
