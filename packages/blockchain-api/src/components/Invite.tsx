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
    [step],
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
            : "Failed to claim welcome pack",
        );
      }
    },
    {
      onError: (error) => {
        console.error("Error claiming welcome pack:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to claim welcome pack",
        );
      },
    },
  );

  return (
    <div className="flex items-center justify-center w-full min-h-[100dvh]">
      <div className="w-full h-[100dvh] md:w-full md:max-w-6xl md:h-auto p-8 flex flex-col justify-between md:justify-center">
        <div className="flex-1 flex flex-col justify-center md:justify-start">
          <div className="mb-6">
            <InviteStepper steps={steps} currentStep={step} />
          </div>
        </div>

        <div className="flex flex-col items-center justify-end gap-4 md:mt-6 md:max-w-sm h-full md:mx-auto">
          {step === 0 && (
            <ConnectWalletButton className="w-full" onLogin={login} />
          )}
          {step === 1 && (
            <Button
              variant="secondary"
              onClick={handleSignAndSend}
              disabled={loading}
              className="hover:cursor-pointer w-full"
            >
              {loading ? "Claiming..." : "Claim Hotspot"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
