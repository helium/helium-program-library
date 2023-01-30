import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { BN, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { mobileInfoKey } from "../pdas";
import { proofArgsAndAccounts, ProofArgsAndAccountsArgs } from "./proofArgsAndAccounts";

export async function updateMobileMetadata({
  program,
  rewardableEntityConfig,
  assetId,
  location,
  dcFeePayer,
  payer,
  ...rest
}: {
  program: Program<HeliumEntityManager>;
  payer?: PublicKey;
  dcFeePayer?: PublicKey;
  location: BN | null;
  assetId: PublicKey;
  rewardableEntityConfig: PublicKey;
} & Omit<ProofArgsAndAccountsArgs, "connection">) {
  const {
    asset: {
      content: { json_uri },
      ownership: { owner },
    },
    args,
    accounts,
    remainingAccounts,
  } = await proofArgsAndAccounts({
    connection: program.provider.connection,
    assetId,
    ...rest,
  });
  const [info] = await mobileInfoKey(rewardableEntityConfig, json_uri.split("/").slice(-1)[0]);

  return program.methods
    .updateMobileInfoV0({
      location,
      ...args
    })
    .accounts({
      ...accounts,
      dcFeePayer,
      payer,
      rewardableEntityConfig,
      hotspotOwner: owner,
      mobileInfo: info,
    })
    .remainingAccounts(remainingAccounts);
}
