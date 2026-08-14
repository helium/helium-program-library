"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { User2, Building2 } from "lucide-react";
import { cn } from "@/lib/utils/misc";

export function AccountTypeSelection() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<"individual" | "business">(
    "individual"
  );

  const handleSubmit = () => {
    if (!accountType) return;
    router.push(`/withdraw?step=3&type=${accountType}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-foreground text-xl font-semibold">
          Select Account Type
        </h2>
        <p className="text-muted-foreground mt-2">
          Choose whether you are withdrawing funds as an individual or a
          business.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card
          className={cn(
            "hover:border-primary cursor-pointer p-6 transition-all",
            "flex flex-col items-center justify-center space-y-4 text-center",
            accountType === "individual" && "border-primary border-2"
          )}
          onClick={() => setAccountType("individual")}
        >
          <div className="bg-primary/10 flex h-16 w-16 items-center justify-center rounded-full">
            <User2 className="text-primary h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Individual</h3>
            <p className="text-muted-foreground text-sm">
              Personal account for individual use
            </p>
          </div>
        </Card>

        <Card
          className={cn(
            "hover:border-primary cursor-pointer p-6 transition-all",
            "flex flex-col items-center justify-center space-y-4 text-center",
            accountType === "business" && "border-primary border-2"
          )}
          onClick={() => setAccountType("business")}
        >
          <div className="bg-primary/10 flex h-16 w-16 items-center justify-center rounded-full">
            <Building2 className="text-primary h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Business</h3>
            <p className="text-muted-foreground text-sm">
              Business or organization account
            </p>
          </div>
        </Card>
      </div>

      <Button onClick={handleSubmit} disabled={!accountType} className="w-full">
        Continue
      </Button>
    </div>
  );
}
