"use client";

import { Button } from "@/components/ui/button";
import { truncateAddress } from "@/lib/utils/misc";
import { Copy } from "lucide-react";
import { toast } from "sonner";

export function CopyAddressButton({
  address,
  truncateStart = 6,
  truncateEnd = 6,
  className,
}: {
  address: string;
  truncateStart?: number;
  truncateEnd?: number;
  className?: string;
}) {
  const copy = async () => {
    await navigator.clipboard.writeText(address);
    toast.success("Copied to clipboard");
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={copy}
      className={["font-mono text-xs", className].filter(Boolean).join(" ")}
    >
      {truncateAddress(address, truncateStart, truncateEnd)}
      <Copy className="h-3 w-3 ml-2" />
    </Button>
  );
}
