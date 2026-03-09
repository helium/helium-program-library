import { cn } from "@/lib/utils/misc";

interface InviteStepperProps {
  steps: Array<{
    title: string;
  }>;
  currentStep: number;
}

export function InviteStepper({ steps, currentStep }: InviteStepperProps) {
  return (
    <div className="flex flex-col md:flex-row items-center w-full gap-4">
      {steps.map((step, idx) => (
        <div
          key={step.title}
          className="flex flex-col items-center relative flex-1 w-full md:w-auto"
        >
          {idx > 0 && (
            <div
              className={cn(
                "md:hidden absolute -top-4 left-1/2 w-0.5 h-6 -translate-x-1/2 z-0",
                idx <= currentStep ? "bg-green-600" : "bg-gray-300",
              )}
            />
          )}
          {idx > 0 && (
            <div
              className={cn(
                "hidden md:block absolute top-1/2 -left-4 w-4 h-0.5 -translate-y-1/2 z-0",
                idx <= currentStep ? "bg-green-600" : "bg-gray-300",
              )}
            />
          )}
          <div
            className={cn(
              "bg-white dark:bg-accent rounded-lg p-4 w-full relative",
              idx === currentStep
                ? "outline outline-blue-600 dark:outline-blue-400"
                : idx < currentStep
                  ? "opacity-60"
                  : "",
            )}
          >
            <div className="flex flex-row md:flex-col gap-4 p-6">
              <div
                className={cn(
                  "rounded-full h-8 w-8 flex items-center justify-center text-sm font-medium flex-shrink-0 md:order-2",
                  idx < currentStep
                    ? "bg-green-600 ring-4 ring-green-300 dark:ring-green-800 text-black dark:text-white"
                    : idx === currentStep
                      ? "bg-blue-600 ring-4 ring-blue-300 dark:ring-blue-800 text-black dark:text-white"
                      : "bg-gray-300 text-black",
                )}
              >
                {idx < currentStep ? (
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              <div className="flex flex-col gap-1 md:order-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Step {idx + 1}
                </p>
                <p className="text-md md:text-xl font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                  {step.title}
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
