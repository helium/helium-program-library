import { heliumEntityManagerResolvers, keyToAssetKey, programApprovalKey } from "@helium/helium-entity-manager-sdk";
import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver,
  resolveIndividual
} from "@helium/anchor-resolvers";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { PROGRAM_ID as HELIUM_ENTITY_MANAGER_PROGRAM_ID } from "@helium/helium-entity-manager-sdk";
import { init } from "./init";
import { AnchorProvider } from "@coral-xyz/anchor";

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
    if (path[path.length - 1] == "programApproval") {
      return programApprovalKey(accounts.dao as PublicKey, PROGRAM_ID)[0];
    }
  }),
  resolveIndividual(async ({ idlIx, path, accounts, provider }) => {
    if (
      path[path.length - 1] === "keyToAsset" &&
      accounts.carrier &&
      accounts.dao &&
      idlIx.name === "issueCarrierNftV0"
    ) {
      const program = await init(provider as AnchorProvider)
      const carrier = await program.account.carrierV0.fetchNullable(accounts.carrier as PublicKey);
      if (!carrier) {
        return
      }
      return keyToAssetKey(
        accounts.dao as PublicKey,
        Buffer.from(carrier.name, "utf-8")
      )[0];
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
    mint: "dntMint",
    owner: "payer",
  }),
  ataResolver({
    instruction: "initializeCarrierV0",
    account: "escrow",
    mint: "dntMint",
    owner: "carrier",
  })
);
