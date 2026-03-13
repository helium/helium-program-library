import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["@helium/onboarding"],
  transpilePackages: [
    "@privy-io/react-auth",
    "@privy-io/js-sdk-core",
    "uuid",
    "@helium/blockchain-api",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/solana-labs/token-list/main/assets/mainnet/*/logo.png",
      },
      {
        protocol: "https",
        hostname: "cryptologos.cc",
      },
      {
        protocol: "https",
        hostname: "entities.nft.helium.io",
      },
    ],
  },
  // Enable source maps in production for better error tracking
  productionBrowserSourceMaps: true,
};

export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      silent: true,
      release: process.env.SENTRY_RELEASE,
    })
  : nextConfig;
