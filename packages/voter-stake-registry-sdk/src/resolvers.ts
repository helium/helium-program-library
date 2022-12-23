import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver,
  resolveIndividual
} from "@helium/spl-utils";
import { getAccount } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { voterWeightRecordKey } from "./pdas";
export * from "./constants";
export * from "./pdas";
export * from "./resolvers";

export const vsrResolvers = combineResolvers(
  heliumCommonResolver,
  ataResolver({
    instruction: "initializePositionV0",
    account: "vault",
    mint: "depositMint",
    owner: "position",
  }),
  ataResolver({
    instruction: "depositV0",
    account: "vault",
    mint: "mint",
    owner: "position",
  }),
  ataResolver({
    instruction: "withdrawV0",
    account: "vault",
    mint: "depositMint",
    owner: "position",
  }),
  ataResolver({
    instruction: "withdrawV0",
    account: "destination",
    mint: "depositMint",
  }),
  ataResolver({
    instruction: "depositV0",
    account: "depositToken",
    mint: "mint",
    owner: "depositAuthority",
  }),
  ataResolver({
    instruction: "withdrawV0",
    account: "vault",
    mint: "depositMint",
    owner: "position",
  }),
  ataResolver({
    instruction: "transferV0",
    account: "sourceVault",
    mint: "depositMint",
    owner: "sourcePosition",
  }),
  ataResolver({
    instruction: "transferV0",
    account: "targetVault",
    mint: "depositMint",
    owner: "targetPosition",
  }),
  ataResolver({
    account: "positionTokenAccount",
    mint: "mint",
    owner: "positionAuthority",
  }),
  resolveIndividual(async ({ accounts, path, provider }) => {
    if (path[path.length - 1] === "solDestination") {
      // @ts-ignore
      return provider.wallet.publicKey;
    } else if (
      path[path.length - 1] === "voterWeightRecord" &&
      accounts.registrar &&
      (accounts.voterAuthority || accounts.positionTokenAccount)
    ) {
      if (!accounts.voterAuthority) {
        return voterWeightRecordKey(
          accounts.registrar as PublicKey,
          accounts.voterAuthority as PublicKey
        )[0];
      } else {
        const acct = await getAccount(
          provider.connection,
          accounts.positionTokenAccount as PublicKey
        );
        return voterWeightRecordKey(
          accounts.registrar as PublicKey,
          acct.owner
        )[0];
      }
    }
  })
);
