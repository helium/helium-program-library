"use client";

import { useIsOwner } from "@/hooks/useIsOwner";
import { useQuery } from "@tanstack/react-query";
import { KycStatus } from "./KycStatus";
import { BankAccounts } from "../withdraw/BankAccounts";
import { client } from "@/lib/orpc";

const fetchKycStatus = async () => {
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

export function VerificationOrBankAccounts({
  walletAddress,
}: {
  walletAddress: string;
}) {
  const isOwner = useIsOwner(walletAddress);
  const { data: kycData } = useQuery({
    queryKey: ["kycStatus"],
    queryFn: fetchKycStatus,
    enabled: isOwner,
  });

  // Only show KYC status if verification is needed or in progress
  const showKycStatus =
    !kycData ||
    kycData.kycStatus !== "approved" ||
    kycData.tosStatus !== "approved";

  if (!isOwner) {
    return null;
  }

  if (showKycStatus) {
    return <KycStatus />;
  }

  return <BankAccounts />;
}
