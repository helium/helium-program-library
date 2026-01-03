import * as anchor from "@coral-xyz/anchor";
import * as client from "@helium/distributor-oracle";
import {
  init as initHem,
  keyToAssetKey
} from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import {
  init as initLazy,
  lazyDistributorKey
} from "@helium/lazy-distributor-sdk";
import {
  init as initRewards,
} from "@helium/rewards-oracle-sdk";
import { HNT_MINT, sendAndConfirmWithRetry } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";

export async function run(args: any = process.argv) {
  const argv = await yargs(args).options({
    wallet: {
      alias: "k",
      describe: "Anchor wallet keypair",
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: "u",
      default: "http://127.0.0.1:8899",
      describe: "The solana url",
    },
    mint: {
      type: "string",
      describe: "Pubkey of the rewards mint",
    },
    assetId: {
      type: "string",
      describe: "The asset id to claim rewards for",
    },
    entityKey: {
      type: "string",
      describe: "The entity key to claim rewards for",
    },
    hntMint: {
      type: "string",
      default: HNT_MINT,
    },
  }).argv;

  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const lazyProgram = await initLazy(provider);
  const hemProgram = await initHem(provider);
  const rewardsOracleProgram = await initRewards(provider);

  const mint = new PublicKey(argv.mint!);
  const dao = daoKey(new PublicKey(argv.hntMint))[0];
  const lazyDistributor = lazyDistributorKey(mint)[0];
  let assetId = argv.assetId ? new PublicKey(argv.assetId) : undefined;
  if (!assetId) {
    const entityKey = argv.entityKey;
    const keyToAsset = keyToAssetKey(dao, entityKey!)[0];
    assetId = (await hemProgram.account.keyToAssetV0.fetch(keyToAsset)).asset;
  }

  const rewards = await client.getCurrentRewards(
    lazyProgram,
    lazyDistributor,
    assetId
  );
  const tx = await client.formTransaction({
    program: lazyProgram,
    rewardsOracleProgram: rewardsOracleProgram,
    provider,
    rewards,
    asset: assetId,
    lazyDistributor,
  });
  const signed = await provider.wallet.signTransaction(tx);
  await sendAndConfirmWithRetry(
    provider.connection,
    Buffer.from(signed.serialize()),
    { skipPreflight: true },
    "confirmed"
  );
}
