import { ataResolver, combineResolvers } from "@helium-foundation/spl-utils";
import { heliumSubDaosResolvers } from "@helium-foundation/helium-sub-daos-sdk";
import { resolveIndividual } from "@helium-foundation/spl-utils";
import { AnchorProvider } from "@project-serum/anchor";
import { circuitBreakerResolvers } from "@helium-foundation/circuit-breaker-sdk";

export const dataCreditsResolvers = combineResolvers(
  heliumSubDaosResolvers,
  circuitBreakerResolvers,
  ataResolver({
    instruction: "mintDataCreditsV0",
    account: "recipientTokenAccount",
    mint: "dcMint",
    owner: "recipient",
  }),
  ataResolver({
    instruction: "mintDataCreditsV0",
    account: "burner",
    mint: "hntMint",
    owner: "owner",
  }),
  ataResolver({
    instruction: "useDataCreditsV0",
    account: "fromAccount",
    mint: "dcMint",
    owner: "owner",
  }),
  ataResolver({
    instruction: "mintDataCreditsV0",
    account: "recipientTokenAccount",
    mint: "dcMint",
    owner: "recipient",
  }),
  resolveIndividual(async ({ path, accounts, provider }) => {
    if (path[path.length - 1] === "recipient" && !accounts.recipient && (provider as AnchorProvider).wallet) {
      return (provider as AnchorProvider).wallet.publicKey;
    }
  })
);
