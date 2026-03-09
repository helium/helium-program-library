"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";

export function WithdrawToBankButton() {
  const [isLoading, setIsLoading] = useState(false);
  const { user } = usePrivy();
  const router = useRouter();

  const handleWithdraw = () => {
    if (!user?.id) return;
    router.push("/withdraw");
  };

  return (
    <Button onClick={handleWithdraw} disabled={isLoading || !user}>
      {isLoading ? "Loading..." : "Withdraw to Bank Account"}
    </Button>
  );
}
