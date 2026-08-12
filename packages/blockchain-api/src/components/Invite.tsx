"use client";

import { ConnectWalletButton } from "@/components/auth/ConnectWalletButton";
import { InviteStepper } from "@/components/InviteStepper";
import { Button } from "@/components/ui/button";
import { useTransactionSubmission } from "@/hooks/useTransactionSubmission";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { useWalletAddress } from "@/hooks/useWalletAddress";
import { useEffect, useState, useMemo } from "react";
import { useAsyncCallback } from "react-async-hook";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { dashboard } from "@/lib/utils/routes";
import { client } from "@/lib/orpc";

export default function Invite({
  welcomePackAddress,
  expirationTs,
  signature,
}: {
  welcomePackAddress: string;
  expirationTs: string;
  signature: string;
}) {
  const { user, authenticated } = usePrivy();
  const walletAddress = useWalletAddress();
  const [step, setStep] = useState(0);
  const router = useRouter();
  const { login } = useLogin({
    onComplete: () => {
      setStep(1);
    },
  });

  useEffect(() => {
    if (authenticated && step === 0) {
      setStep(1);
    }
  }, [authenticated, step]);

  const steps = useMemo(
    () => [
      {
        title: step > 0 ? "Logged In" : "Login",
      },
      {
        title: step > 1 ? "Hotspot Claimed" : "Claim Hotspot",
      },
      {
        title: "Start Earning",
      },
    ],
    [step]
  );

  const { submitTransactions } = useTransactionSubmission();
  const { loading, execute: handleSignAndSend } = useAsyncCallback(
    async () => {
      if (!walletAddress || !signature || !expirationTs) return;

      try {
        const { transactionData } = await client.welcomePacks.claim({
          packAddress: welcomePackAddress,
          walletAddress,
          signature,
          expirationTs,
        });

        await submitTransactions(transactionData, {
          onSuccess: () => {
            if (walletAddress) {
              router.push(dashboard(walletAddress));
            }
          },
        });
      } catch (error) {
        console.error("Error claiming welcome pack:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to claim welcome pack"
        );
      }
    },
    {
      onError: (error) => {
        console.error("Error claiming welcome pack:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to claim welcome pack"
        );
      },
    }
  );

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center">
      <div className="flex h-[100dvh] w-full flex-col justify-between p-8 md:h-auto md:w-full md:max-w-6xl md:justify-center">
        <div className="flex flex-1 flex-col justify-center md:justify-start">
          <div className="mb-6">
            <InviteStepper steps={steps} currentStep={step} />
          </div>
        </div>

        <div className="flex h-full flex-col items-center justify-end gap-4 md:mx-auto md:mt-6 md:max-w-sm">
          {step === 0 && (
            <ConnectWalletButton className="w-full" onLogin={login} />
          )}
          {step === 1 && (
            <Button
              variant="secondary"
              onClick={handleSignAndSend}
              disabled={loading}
              className="w-full hover:cursor-pointer"
            >
              {loading ? "Claiming..." : "Claim Hotspot"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
