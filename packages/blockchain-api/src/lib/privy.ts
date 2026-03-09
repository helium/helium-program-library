import { PrivyClient } from "@privy-io/server-auth";
import { env } from "./env";

// Create a single shared instance of PrivyClient
export const privy = new PrivyClient(
  env.NEXT_PUBLIC_PRIVY_APP_ID,
  env.PRIVY_APP_SECRET,
);

// Base64 encode app_id:app_secret for Basic auth
export const basicAuthHeader = Buffer.from(
  env.NEXT_PUBLIC_PRIVY_APP_ID + ":" + env.PRIVY_APP_SECRET,
).toString("base64");
