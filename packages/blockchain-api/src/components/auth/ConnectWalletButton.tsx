"use client";

import { Button } from "@/components/ui/button";
import { usePrivy } from "@privy-io/react-auth";

export const ConnectWalletButton = ({
  variant = "secondary",
  size = "lg",
  className = "",
  children,
  onLogin,
}: {
  onLogin?: () => void;
  variant?: "outline" | "default" | "ghost" | "link" | "secondary";
  size?: "lg" | "sm" | "default";
  className?: string;
  children?: React.ReactNode;
}) => {
  const { ready, login } = usePrivy();

  return (
    <Button
      disabled={!ready}
      variant={variant}
      size={size}
      className={className + " hover:cursor-pointer"}
      onClick={onLogin ? onLogin : login}
    >
      {children || "Login"}
    </Button>
  );
};
