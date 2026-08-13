import { cn } from "@/lib/utils/misc";

interface PageStepperProps {
  steps: string[];
  currentStep: number;
}

export function PageStepper({ steps, currentStep }: PageStepperProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl items-center">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isCompleted = stepNumber < currentStep;

        return (
          <div key={label} className="flex flex-1 items-center">
            <div className="flex flex-shrink-0 items-center">
              <div
                className={cn(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {stepNumber}
              </div>

              <span
                className={cn(
                  "ml-2 hidden whitespace-nowrap text-sm sm:inline",
                  isActive
                    ? "text-foreground font-medium"
                    : isCompleted
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </div>

            {stepNumber < steps.length && (
              <div
                className={cn(
                  "mx-2 h-px min-w-[1rem] flex-1",
                  stepNumber < currentStep ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
