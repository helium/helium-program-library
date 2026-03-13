"use client";

import { PrivyProvider as PrivyProviderBase } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { env } from "@/lib/env";

export const PrivyProvider = ({ children }: { children: React.ReactNode }) => {
  if (env.NEXT_PUBLIC_PRIVY_APP_ID.startsWith("__")) {
    return <>{children}</>;
  }

  return (
    <PrivyProviderBase
      appId={env.NEXT_PUBLIC_PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "wallet"],
        appearance: {
          logo: "/images/helium-auth-logo.png",
          theme: "dark",
          accentColor: "#676FFF",
          walletChainType: "solana-only",
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors(),
          },
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </PrivyProviderBase>
  );
};
