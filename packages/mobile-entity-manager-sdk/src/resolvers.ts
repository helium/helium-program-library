import {
  heliumEntityManagerResolvers,
  keyToAssetKey,
  programApprovalKey,
} from "@helium/helium-entity-manager-sdk";
import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver,
  resolveIndividual,
} from "@helium/anchor-resolvers";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PROGRAM_ID } from "./constants";
import { PROGRAM_ID as HELIUM_ENTITY_MANAGER_PROGRAM_ID } from "@helium/helium-entity-manager-sdk";
import { init } from "./init";
import { AnchorProvider } from "@coral-xyz/anchor";
import { incentiveProgramKey } from "./pdas";

export const mobileEntityManagerResolvers = combineResolvers(
  heliumCommonResolver,
  heliumEntityManagerResolvers,
  resolveIndividual(async ({ path }) => {
    switch (path[path.length - 1]) {
      case "heliumEntityManagerProgram":
        return HELIUM_ENTITY_MANAGER_PROGRAM_ID;
    }
  }),
  resolveIndividual(async ({ path, accounts }) => {
    if (path[path.length - 1] == "programApproval" && accounts.dao) {
      return programApprovalKey(accounts.dao as PublicKey, PROGRAM_ID)[0];
    }
  }),
  resolveIndividual(async ({ idlIx, path, accounts, provider, args }) => {
    if (
      path[path.length - 1] === "keyToAsset" &&
      accounts.carrier &&
      accounts.dao &&
      idlIx.name === "issueCarrierNftV0"
    ) {
      const program = await init(provider as AnchorProvider);
      const carrier = await program.account.carrierV0.fetchNullable(
        accounts.carrier as PublicKey
      );
      if (!carrier) {
        return;
      }
      return keyToAssetKey(
        accounts.dao as PublicKey,
        Buffer.from(carrier.name, "utf-8")
      )[0];
    } else if (
      path[path.length - 1] === "incentiveEscrowProgram" &&
      accounts.carrier &&
      args[0].name
    ) {
      return incentiveProgramKey(
        accounts.carrier as PublicKey,
        args[0].name
      )[0];
    } else if (
      path[path.length - 1] === "keyToAsset" &&
      accounts.carrier &&
      accounts.dao &&
      idlIx.name === "initializeIncentiveProgramV0"
    ) {
      return keyToAssetKey(
        accounts.dao as PublicKey,
        Buffer.from(args[0].name, "utf-8")
      )[0];
    }
  }),
  resolveIndividual(async ({ idlIx, path, accounts, provider }) => {
    // `destination` is the ATA of `carrier.update_authority` for whatever mint the escrow holds.
    // Neither is an account on the instruction, so `ataResolver` cannot express it.
    if (
      path[path.length - 1] === "destination" &&
      idlIx.name === "closeCarrierV0" &&
      accounts.carrier
    ) {
      const program = await init(provider as AnchorProvider);
      const carrier = await program.account.carrierV0.fetchNullable(
        accounts.carrier as PublicKey
      );
      if (!carrier) {
        return;
      }
      const escrow = await (provider as AnchorProvider).connection.getAccountInfo(
        carrier.escrow
      );
      if (!escrow) {
        return;
      }
      // SPL token account layout: mint is the first 32 bytes.
      const mint = new PublicKey(escrow.data.subarray(0, 32));
      return getAssociatedTokenAddressSync(mint, carrier.updateAuthority, true);
    }
  }),
  ataResolver({
    instruction: "initializeCarrierV0",
    account: "tokenAccount",
    mint: "collection",
    owner: "carrier",
  }),
  ataResolver({
    instruction: "initializeCarrierV0",
    account: "source",
    mint: "hntMint",
    owner: "payer",
  }),
  ataResolver({
    instruction: "initializeCarrierV0",
    account: "escrow",
    mint: "hntMint",
    owner: "carrier",
  })
);
