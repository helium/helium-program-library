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
    "individual",
  );

  const handleSubmit = () => {
    if (!accountType) return;
    router.push(`/withdraw?step=3&type=${accountType}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Select Account Type
        </h2>
        <p className="text-muted-foreground mt-2">
          Choose whether you are withdrawing funds as an individual or a
          business.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className={cn(
            "p-6 cursor-pointer transition-all hover:border-primary",
            "flex flex-col items-center justify-center text-center space-y-4",
            accountType === "individual" && "border-2 border-primary",
          )}
          onClick={() => setAccountType("individual")}
        >
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <User2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Individual</h3>
            <p className="text-sm text-muted-foreground">
              Personal account for individual use
            </p>
          </div>
        </Card>

        <Card
          className={cn(
            "p-6 cursor-pointer transition-all hover:border-primary",
            "flex flex-col items-center justify-center text-center space-y-4",
            accountType === "business" && "border-2 border-primary",
          )}
          onClick={() => setAccountType("business")}
        >
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Business</h3>
            <p className="text-sm text-muted-foreground">
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
