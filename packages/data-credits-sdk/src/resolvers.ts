import { ataResolver, combineResolvers } from "@helium/anchor-resolvers";
import { heliumSubDaosResolvers } from "@helium/helium-sub-daos-sdk";
import { resolveIndividual } from "@helium/anchor-resolvers";
import { AnchorProvider } from "@coral-xyz/anchor";
import { circuitBreakerResolvers } from "@helium/circuit-breaker-sdk";
import { HNT_PYTH_PRICE_FEED } from "@helium/spl-utils";
import { delegatedDataCreditsKey } from "./pdas";
import { PublicKey } from "@solana/web3.js";

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
    instruction: "delegateDataCreditsV0",
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
  resolveIndividual(async ({ path, accounts, provider, args }) => {
    if (
      path[path.length - 1] === "recipient" &&
      !accounts.recipient &&
      (provider as AnchorProvider).wallet
    ) {
      return (provider as AnchorProvider).wallet.publicKey;
    } else if (
      path[path.length - 1] === "hntPriceOracle" &&
      !accounts.hntPriceOracle
    ) {
      // The on-chain IDL has no resolution info for this account (the has_one
      // was dropped when ephemeral price updates were supported), so default to
      // the crank-fed feed the program blesses.
      return HNT_PYTH_PRICE_FEED;
    } else if (
      path[path.length - 1] === "delegatedDataCredits" &&
      !accounts.delegatedDataCredits &&
      accounts.subDao &&
      args[0].routerKey
    ) {
      return delegatedDataCreditsKey(
        accounts.subDao as PublicKey,
        args[0].routerKey
      )[0];
    }
  })
);
