import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { iotInfoKey, keyToAssetKey } from "../pdas";
import { proofArgsAndAccounts, ProofArgsAndAccountsArgs } from "./proofArgsAndAccounts";


export async function onboardIotHotspot({
  program,
  rewardableEntityConfig,
  assetId,
  maker,
  dao,
  dcFeePayer,
  payer,
  location,
  elevation,
  gain,
  ...rest
}: {
  program: Program<HeliumEntityManager>;
  rewardableEntityConfig: PublicKey;
  payer?: PublicKey;
  dcFeePayer?: PublicKey;
  maker: PublicKey;
  location?: BN;
  elevation?: number;
  gain?: number;
  dao: PublicKey;
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
  const makerAcc = await program.account.makerV0.fetchNullable(maker);

  const keyToAsset = (
    await keyToAssetKey(dao, json_uri.split("/").slice(-1)[0])
  )[0];
  return program.methods
    .onboardIotHotspotV0({
      ...args,
      location: typeof location == "undefined" ? null : location,
      elevation: typeof elevation == "undefined" ? null : elevation,
      gain: typeof gain == "undefined" ? null : gain,
    })
    .accounts({
      // hotspot: assetId,
      ...accounts,
      payer,
      dcFeePayer,
      rewardableEntityConfig,
      hotspotOwner: owner,
      iotInfo: info,
      maker,
      dao,
      issuingAuthority: makerAcc?.issuingAuthority,
      keyToAsset,
    })
    .remainingAccounts(remainingAccounts);
}
