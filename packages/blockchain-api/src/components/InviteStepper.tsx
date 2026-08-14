import { cn } from "@/lib/utils/misc";

interface InviteStepperProps {
  steps: Array<{
    title: string;
  }>;
  currentStep: number;
}

export function InviteStepper({ steps, currentStep }: InviteStepperProps) {
  return (
    <div className="flex w-full flex-col items-center gap-4 md:flex-row">
      {steps.map((step, idx) => (
        <div
          key={step.title}
          className="relative flex w-full flex-1 flex-col items-center md:w-auto"
        >
          {idx > 0 && (
            <div
              className={cn(
                "absolute -top-4 left-1/2 z-0 h-6 w-0.5 -translate-x-1/2 md:hidden",
                idx <= currentStep ? "bg-green-600" : "bg-gray-300"
              )}
            />
          )}
          {idx > 0 && (
            <div
              className={cn(
                "absolute -left-4 top-1/2 z-0 hidden h-0.5 w-4 -translate-y-1/2 md:block",
                idx <= currentStep ? "bg-green-600" : "bg-gray-300"
              )}
            />
          )}
          <div
            className={cn(
              "dark:bg-accent relative w-full rounded-lg bg-white p-4",
              idx === currentStep
                ? "outline outline-blue-600 dark:outline-blue-400"
                : idx < currentStep
                ? "opacity-60"
                : ""
            )}
          >
            <div className="flex flex-row gap-4 p-6 md:flex-col">
              <div
                className={cn(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-medium md:order-2",
                  idx < currentStep
                    ? "bg-green-600 text-black ring-4 ring-green-300 dark:text-white dark:ring-green-800"
                    : idx === currentStep
                    ? "bg-blue-600 text-black ring-4 ring-blue-300 dark:text-white dark:ring-blue-800"
                    : "bg-gray-300 text-black"
                )}
              >
                {idx < currentStep ? (
                  <svg
                    className="h-4 w-4"
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
                <p className="text-md font-semibold leading-tight text-gray-900 dark:text-gray-100 md:text-xl">
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
