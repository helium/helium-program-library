import { redirect } from "next/navigation";
import { PageStepper } from "@/components/PageStepper";
import { WithdrawStepContent } from "@/components/withdraw/WithdrawStepContent";

export default async function WithdrawPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  // Default to step 1 if no step provided
  const { step } = await searchParams;
  const currentStep = parseInt(step || "1");

  // Validate step is between 1-5
  if (isNaN(currentStep) || currentStep < 1 || currentStep > 5) {
    redirect("/withdraw?step=1");
  }

  const steps = [
    "Verify Email",
    "Account Type",
    "Accept Terms",
    "Identity Verification",
    "Bank Account",
  ];

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4 sm:px-6">
      <h1 className="text-2xl font-bold mb-12 text-foreground text-center">
        Withdraw to Bank Account
      </h1>

      <div className="mb-12">
        <PageStepper steps={steps} currentStep={currentStep} />
      </div>

      <div className="mt-8">
        <WithdrawStepContent step={currentStep} />
      </div>
    </div>
  );
}
