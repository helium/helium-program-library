"use client";

import { useAsync, useAsyncCallback } from "react-async-hook";
import { usePrivy } from "@privy-io/react-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Alert, AlertDescription } from "../ui/alert";
import { useRouter } from "next/navigation";
import { client } from "@/lib/orpc";

type KycStatusType =
  | "not_started"
  | "incomplete"
  | "under_review"
  | "approved"
  | "rejected";
type TosStatusType = "pending" | "approved";

interface KycData {
  kycStatus: KycStatusType;
  tosStatus: TosStatusType;
  kycLink?: string | null;
  tosLink?: string | null;
  rejectionReasons?: string[];
}

const checkKycStatus = async (userId?: string) => {
  if (!userId) return null;
  try {
    return await client.fiat.getKycStatus({});
  } catch (error: any) {
    if (error.status === 401) {
      return {
        kycStatus: "not_started" as const,
        tosStatus: "pending" as const,
        kycLink: null,
        tosLink: null,
        kycLinkId: null,
      };
    }
    throw error;
  }
};

export function KycStatus() {
  const { user } = usePrivy();
  const router = useRouter();

  const {
    result: kycData,
    error,
    loading: isLoading,
    execute: refreshStatus,
  } = useAsync(checkKycStatus, [user?.id]);

  // Poll for updates if under review
  useAsync(async () => {
    if (!user?.id || kycData?.kycStatus !== "under_review") return;
    const interval = setInterval(refreshStatus, 30000);
    return () => clearInterval(interval);
  }, [user?.id, kycData?.kycStatus]);

  const { execute: handleStartKyc, loading: isStarting } = useAsyncCallback(
    async () => {
      await refreshStatus();
      router.push("/withdraw?step=1");
    },
  );

  const renderStatus = () => {
    if (!kycData) return null;

    switch (kycData.kycStatus) {
      case "not_started":
        return (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              You haven&apos;t started the identity verification process yet.
            </p>
            <Button onClick={handleStartKyc} disabled={isStarting}>
              {isStarting ? "Loading..." : "Start Verification"}
            </Button>
          </div>
        );

      case "incomplete":
        return (
          <Alert>
            <AlertDescription>
              Your verification is incomplete. Please complete the process to
              enable withdrawals.
              <Button
                variant="link"
                onClick={handleStartKyc}
                className="p-0 h-auto font-normal ml-2"
              >
                Continue Verification
              </Button>
            </AlertDescription>
          </Alert>
        );

      case "under_review":
        return (
          <Alert>
            <AlertDescription>
              Your identity verification is under review. This typically takes
              less than a minute, but may take up to one business day.
            </AlertDescription>
          </Alert>
        );

      case "rejected":
        return (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>
                {kycData.rejectionReasons?.[0] ||
                  "Your verification was rejected. Please try again."}
              </AlertDescription>
            </Alert>
            <Button onClick={handleStartKyc} disabled={isStarting}>
              Try Again
            </Button>
          </div>
        );

      case "approved":
        if (kycData.tosStatus === "pending") {
          return (
            <Alert>
              <AlertDescription>
                Identity verification approved! Please accept the terms of
                service to continue.
                <Button
                  variant="link"
                  onClick={handleStartKyc}
                  className="p-0 h-auto font-normal ml-2"
                >
                  Accept Terms
                </Button>
              </AlertDescription>
            </Alert>
          );
        }
        return (
          <Alert>
            <AlertDescription className="text-green-600 dark:text-green-400">
              ✓ Your account is fully verified
            </AlertDescription>
          </Alert>
        );

      default:
        return null;
    }
  };

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Verification Status</CardTitle>
        <CardDescription>
          Identity verification is required to withdraw funds to your bank
          account
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <p className="text-muted-foreground">Loading status...</p>
        ) : (
          renderStatus()
        )}
      </CardContent>
    </Card>
  );
}
