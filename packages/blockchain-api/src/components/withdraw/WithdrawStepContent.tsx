"use client";

import { useEffect, useMemo, useRef, useCallback } from "react";
import { useAsync, useAsyncCallback } from "react-async-hook";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useWalletAddress } from "@/hooks/useWalletAddress";
import { Button } from "../ui/button";
import { BankAccountForm } from "./BankAccountForm";
import { Card } from "../ui/card";
import { AccountTypeSelection } from "./AccountTypeSelection";
import { client } from "@/lib/orpc";

interface KycData {
  kycStatus: string;
  tosStatus: string;
  kycLink?: string | null;
  tosLink?: string | null;
  rejectionReasons?: string[];
  accountType?: "individual" | "business" | null;
  kycLinkId?: string | null;
}

const checkKycStatus = async (
  type: "individual" | "business" | null,
): Promise<KycData | null> => {
  return (await client.fiat.initKyc({
    type: type || undefined,
  })) as unknown as KycData;
};

// Remove getWidgetUrl function as we'll use direct links

export function WithdrawStepContent({ step }: { step: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, user, linkEmail } = usePrivy();
  const walletAddress = useWalletAddress();
  const pollInterval = useRef<NodeJS.Timeout | undefined>(undefined);

  const searchType = searchParams.get("type") as
    | "individual"
    | "business"
    | null;

  // Initial KYC status check
  const {
    result: kycData,
    loading: isCheckingStatus,
    error: kycError,
    execute: refreshKycStatus,
  } = useAsync(
    async () => {
      if (!user?.id || !user?.email) return null;
      if (step > 2) {
        return checkKycStatus(
          searchParams.get("type") as "individual" | "business",
        );
      }
      return null;
    },
    [
      user?.id,
      typeof user?.email === "string" ? user.email : undefined,
      searchParams.get("type"),
      step,
    ],
    { executeOnMount: true },
  );

  const type = useMemo((): "individual" | "business" | null => {
    const accountType = kycData?.accountType;
    if (accountType === "individual" || accountType === "business") {
      return searchType || accountType;
    }
    return searchType;
  }, [searchType, kycData]);

  // Handle email verification
  const { execute: handleEmailVerification } = useAsyncCallback(async () => {
    if (!user) return;
    await linkEmail();
  });

  // Handle KYC status check and flow
  const {
    loading: isProcessingKyc,
    error: processError,
    execute: handleCheckKycStatus,
  } = useAsyncCallback(async () => {
    if (!user?.email) return;

    const data = await checkKycStatus(type);
    if (!data) throw new Error("Failed to check KYC status");

    // If both KYC and ToS are approved, move to step 5
    if (
      (data.kycStatus === "approved" || data.kycStatus === "under_review") &&
      data.tosStatus === "approved"
    ) {
      router.push(`/withdraw?step=5&type=${type}`);
    }

    return data;
  });

  // Start polling for status updates
  const startPolling = useCallback(() => {
    // Clear any existing poll
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
    }

    // Poll every 5 seconds instead of 2 to reduce load
    pollInterval.current = setInterval(async () => {
      const data = await checkKycStatus(type);

      // Only update if status changed
      if (
        data?.kycStatus !== kycData?.kycStatus ||
        data?.tosStatus !== kycData?.tosStatus ||
        !kycData?.kycLink ||
        !kycData?.tosLink
      ) {
        await refreshKycStatus();
      }

      // If both are approved, stop polling and move to next step
      if (
        (data?.kycStatus === "approved" ||
          data?.kycStatus === "under_review") &&
        data?.tosStatus === "approved"
      ) {
        if (pollInterval.current) {
          clearInterval(pollInterval.current);
        }
        router.push(`/withdraw?step=5&type=${type}`);
      }
    }, 5000);
  }, [type, kycData, refreshKycStatus, router]);

  // Start/stop polling based on iframe visibility
  useEffect(() => {
    const needsPollKyc =
      kycData?.kycLink &&
      (kycData.kycStatus === "not_started" ||
        kycData.kycStatus === "incomplete");
    const needsPollTos = kycData?.tosLink && kycData.tosStatus !== "approved";

    if ((needsPollKyc || needsPollTos) && !pollInterval.current) {
      startPolling();
    } else if (!needsPollKyc && !needsPollTos && pollInterval.current) {
      clearInterval(pollInterval.current);
    }

    // Clean up on unmount
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, [
    kycData?.kycLink,
    kycData?.tosLink,
    kycData?.kycStatus,
    kycData?.tosStatus,
    startPolling,
  ]);

  // Modify the useEffect to handle redirects
  useEffect(() => {
    if (ready && !user) {
      router.push("/");
      return;
    }

    if (step === 1 && user?.email) {
      router.push(`/withdraw?step=2&type=${type}`);
      return;
    }

    // If we're on step 3 and ToS is approved, move to KYC step
    if (step === 3 && kycData?.tosStatus === "approved") {
      router.push(`/withdraw?step=4&type=${type}`);
      return;
    }

    // Only check KYC status when entering step 3 and we don't have data yet
    if (step === 3 && user?.id && user?.email && !kycData) {
      handleCheckKycStatus();
      return;
    }

    // If we're on step 4 and kyc is approved, go to step 5
    if (
      step === 4 &&
      (kycData?.kycStatus === "under_review" ||
        kycData?.kycStatus === "approved")
    ) {
      router.push(`/withdraw?step=5&type=${type}`);
      return;
    }

    // Handle redirects for ToS and KYC
    if (step === 3 && kycData?.tosLink && kycData.tosStatus !== "approved") {
      const redirectUrl = new URL(kycData.tosLink);
      redirectUrl.searchParams.set(
        "redirect_uri",
        `${window.location.origin}/withdraw?step=4&type=${type}`,
      );
      window.location.href = redirectUrl.toString();
      return;
    }

    if (step === 4 && kycData?.kycLink && kycData.kycStatus !== "approved") {
      const redirectUrl = new URL(kycData.kycLink);
      redirectUrl.searchParams.set(
        "redirect_uri",
        `${window.location.origin}/withdraw?step=5&type=${type}`,
      );
      window.location.href = redirectUrl.toString();
      return;
    }
  }, [user, ready, step, router, handleCheckKycStatus, kycData, type]);

  // Remove kycUrl and tosUrl memos as we'll use direct links

  const stepContent = useMemo(() => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">
              Verify Your Email
            </h2>
            <p className="text-muted-foreground">
              Before you can withdraw funds, we need to verify your email
              address.
            </p>
            <Button onClick={handleEmailVerification}>Verify Email</Button>
          </div>
        );

      case 2:
        return <AccountTypeSelection />;

      case 3:
        // If ToS is already approved, show loading while we redirect
        if (kycData?.tosStatus === "approved") {
          return (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">
                Terms of Service
              </h2>
              <p className="text-muted-foreground">
                Terms of service accepted. Moving to verification...
              </p>
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
              </div>
            </div>
          );
        }

        // Show ToS redirect button if we have a link
        if (kycData?.tosLink) {
          const redirectUrl = new URL(kycData.tosLink);
          redirectUrl.searchParams.set(
            "redirect_uri",
            `${window.location.origin}/withdraw?step=4&type=${type}`,
          );

          return (
            <div className="space-y-4 transition-opacity duration-200">
              <h2 className="text-xl font-semibold text-foreground">
                Terms of Service
              </h2>
              <p className="text-muted-foreground">
                Please click below to review and accept the terms of service.
              </p>
              <Button
                onClick={() => (window.location.href = redirectUrl.toString())}
              >
                Review Terms of Service
              </Button>
            </div>
          );
        }

        // Loading state while we fetch ToS
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">
              Terms of Service
            </h2>
            <p className="text-muted-foreground">
              Please wait while we prepare your terms of service...
            </p>
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
            </div>
            {(kycError || processError) && (
              <p className="text-destructive">
                {processError?.message || kycError?.message}
              </p>
            )}
          </div>
        );

      case 4:
        // Show KYC redirect button if we have a link and KYC is not approved
        if (kycData?.kycLink && kycData.kycStatus !== "approved") {
          const redirectUrl = new URL(kycData.kycLink);
          redirectUrl.searchParams.set(
            "redirect_uri",
            `${window.location.origin}/withdraw?step=5&type=${type}`,
          );

          return (
            <div className="space-y-4 transition-opacity duration-200">
              <h2 className="text-xl font-semibold text-foreground">
                Identity Verification
              </h2>
              <p className="text-muted-foreground">
                Please click below to complete the verification process.
              </p>
              <Button
                onClick={() => (window.location.href = redirectUrl.toString())}
              >
                Start Verification
              </Button>
            </div>
          );
        }

        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">
              Identity Verification
            </h2>
            <p className="text-muted-foreground">
              Please wait while we prepare your identity verification...
            </p>
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
            </div>
            {(kycError || processError) && (
              <p className="text-destructive">
                {processError?.message || kycError?.message}
              </p>
            )}
          </div>
        );

      case 5:
        if (
          kycData?.kycStatus === "approved" &&
          kycData.tosStatus === "approved"
        ) {
          return (
            <div className="space-y-4 transition-opacity duration-200">
              <h2 className="text-xl font-semibold text-foreground">
                Add Bank Account
              </h2>
              <p className="text-muted-foreground">
                Add your bank account details to receive your funds.
              </p>
              <BankAccountForm
                isBusinessAccount={type === "business"}
                onSuccess={() => router.push(`/dashboard/${walletAddress}`)}
              />
            </div>
          );
        }

        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">
              Identity Verification in Progress
            </h2>
            <p className="text-muted-foreground">
              Please complete your identity verification with our partner.
            </p>
            <Button
              onClick={handleCheckKycStatus}
              disabled={isProcessingKyc || isCheckingStatus}
            >
              {isProcessingKyc || isCheckingStatus
                ? "Checking status..."
                : "Check Status"}
            </Button>
            {(kycError || processError) && (
              <p className="text-destructive">
                {processError?.message || kycError?.message}
              </p>
            )}
          </div>
        );

      default:
        return null;
    }
  }, [
    step,
    isCheckingStatus,
    isProcessingKyc,
    kycData?.tosStatus,
    kycData?.kycStatus,
    kycData?.tosLink,
    kycData?.kycLink,
    kycError,
    processError,
    handleEmailVerification,
    handleCheckKycStatus,
    type,
    router,
    walletAddress,
  ]);

  return (
    <Card className="p-6 transition-opacity duration-200">{stepContent}</Card>
  );
}
