import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { keyToAssetKey, mobileInfoKey } from "../pdas";
import { proofArgsAndAccounts, ProofArgsAndAccountsArgs } from "./proofArgsAndAccounts";

export async function onboardMobileHotspot({
  program,
  rewardableEntityConfig,
  assetId,
  maker,
  dao,
  payer,
  dcFeePayer,
  ...rest
}: {
  program: Program<HeliumEntityManager>;
  payer?: PublicKey;
  dcFeePayer?: PublicKey;
  assetId: PublicKey;
  rewardableEntityConfig: PublicKey;
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

  const [info] = await mobileInfoKey(rewardableEntityConfig, json_uri.split("/").slice(-1)[0]);
  const makerAcc = await program.account.makerV0.fetchNullable(maker);

  return program.methods
    .onboardMobileHotspotV0(args)
    .accounts({
      // hotspot: assetId,
      ...accounts,
      dcFeePayer,
      payer,
      rewardableEntityConfig,
      hotspotOwner: owner,
      mobileInfo: info,
      maker,
      dao,
      issuingAuthority: makerAcc?.issuingAuthority,
      keyToAsset: (
        await keyToAssetKey(dao, json_uri.split("/").slice(-1)[0])
      )[0],
    })
    .remainingAccounts(remainingAccounts);
}
