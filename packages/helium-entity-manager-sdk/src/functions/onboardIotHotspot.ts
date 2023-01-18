import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { Program } from "@project-serum/anchor";
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
  ...rest
}: {
  program: Program<HeliumEntityManager>;
  rewardableEntityConfig: PublicKey;
  payer?: PublicKey;
  dcFeePayer?: PublicKey;
  maker: PublicKey;
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

  const [info] = iotInfoKey(rewardableEntityConfig, assetId);
  const makerAcc = await program.account.makerV0.fetchNullable(maker);

  const keyToAsset = (
    await keyToAssetKey(dao, json_uri.split("/").slice(-1)[0])
  )[0];
  return program.methods
    .onboardIotHotspotV0(args)
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
