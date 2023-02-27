import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { iotInfoKey } from "../pdas";
import {
  proofArgsAndAccounts,
  ProofArgsAndAccountsArgs,
} from "./proofArgsAndAccounts";

export async function updateIotMetadata({
  program,
  rewardableEntityConfig,
  assetId,
  location,
  elevation,
  gain,
  dcFeePayer,
  payer,
  ...rest
}: {
  program: Program<HeliumEntityManager>;
  payer?: PublicKey;
  dcFeePayer?: PublicKey;
  location: BN | null;
  elevation: number | null;
  gain: number | null;
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

  const [info] = await iotInfoKey(
    rewardableEntityConfig,
    json_uri.split("/").slice(-1)[0]
  );

  return program.methods
    .updateIotInfoV0({
      location,
      elevation,
      gain,
      ...args,
    })
    .accounts({
      // hotspot: assetId,
      ...accounts,
      dcFeePayer,
      payer,
      rewardableEntityConfig,
      hotspotOwner: owner,
      iotInfo: info,
    })
    .remainingAccounts(remainingAccounts);
}
