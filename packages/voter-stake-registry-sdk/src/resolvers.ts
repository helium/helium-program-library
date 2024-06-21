import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver,
  resolveIndividual,
} from "@helium/anchor-resolvers";
import { AnchorProvider } from "@coral-xyz/anchor";
import { getAccount } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { init } from ".";
import { voterWeightRecordKey } from "./pdas";
import { proxyAssignmentKey, nftProxyResolvers } from "@helium/nft-proxy-sdk";

export * from "./constants";
export * from "./pdas";
export * from "./resolvers";

export const vsrResolvers = combineResolvers(
  nftProxyResolvers,
  heliumCommonResolver,
  ataResolver({
    instruction: "initializeRegistrarV0",
    account: "tokenAccount",
    mint: "collection",
    owner: "registrar",
  }),
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
  ataResolver({
    instruction: "initializePositionV0",
    account: "positionTokenAccount",
    mint: "mint",
    owner: "recipient",
  }),
  ataResolver({
    instruction: "ledgerTransferPositionV0",
    account: "toTokenAccount",
    mint: "mint",
    owner: "to",
  }),
  ataResolver({
    instruction: "ledgerTransferPositionV0",
    account: "fromTokenAccount",
    mint: "mint",
    owner: "from",
  }),
  ataResolver({
    instruction: "voteV0",
    account: "tokenAccount",
    mint: "mint",
    owner: "voter",
  }),
  ataResolver({
    instruction: "relinquishVoteV1",
    account: "tokenAccount",
    mint: "mint",
    owner: "voter",
  }),
  resolveIndividual(async ({ accounts, path, provider, programId }) => {
    if (path[path.length - 1] === "proposalProgram") {
      return new PublicKey("propFYxqmVcufMhk5esNMrexq2ogHbbC2kP9PU1qxKs");
    } else if (path[path.length - 1] === "recipient") {
      // @ts-ignore
      return provider.wallet.publicKey;
    } else if (
      path[path.length - 1] == "proxyAssignment" &&
      accounts.registrar &&
      accounts.voter &&
      accounts.mint
    ) {
      const program = await init(provider as any, programId);
      const registrar = await program.account.registrar.fetch(
        accounts.registrar as PublicKey
      );
      return proxyAssignmentKey(
        registrar.proxyConfig,
        accounts.mint as PublicKey,
        accounts.voter as PublicKey
      )[0];
    }

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
    } else if (
      path[path.length - 1] === "positionUpdateAuthority" &&
      accounts.registrar
    ) {
      const vsr = await init(provider as AnchorProvider);
      const reg = await vsr.account.registrar.fetch(
        accounts.registrar as PublicKey
      );
      // @ts-ignore
      return reg.positionUpdateAuthority || provider.wallet.publicKey;
    }
  })
);
