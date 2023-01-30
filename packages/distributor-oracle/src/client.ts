import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import {
  TransactionInstruction,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import axios from "axios";
import { recipientKey } from "@helium/lazy-distributor-sdk";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Asset, AssetProof, getAsset, getAssetProof } from "@helium/spl-utils";
import { compressedRecipientKey } from "@helium/lazy-distributor-sdk";
import { distributeCompressionRewards } from "@helium/lazy-distributor-sdk";

export type Reward = {
  currentRewards: string;
  oracleKey: PublicKey;
};
export async function getCurrentRewards(
  program: Program<LazyDistributor>,
  lazyDistributor: PublicKey,
  assetId: PublicKey
): Promise<Reward[]> {
  const lazyDistributorAcc = await program.account.lazyDistributorV0.fetch(
    lazyDistributor
  );

  const results = await Promise.all(
    // @ts-ignore
    lazyDistributorAcc.oracles.map((x: any) =>
      axios.get(`${x.url}?assetId=${assetId.toBase58()}`)
    )
  );
  return results.map((x: any, idx: number) => {
    return {
      currentRewards: x.data.currentRewards,
      // @ts-ignore
      oracleKey: lazyDistributorAcc.oracles[idx].oracle,
    };
  });
}

export async function formTransaction({
  program,
  provider,
  rewards,
  hotspot,
  lazyDistributor,
  wallet = provider.wallet.publicKey,
  skipOracleSign = false,
  getAssetFn = getAsset,
  getAssetProofFn = getAssetProof,
}: {
  program: Program<LazyDistributor>;
  provider: AnchorProvider;
  rewards: Reward[];
  hotspot: PublicKey;
  lazyDistributor: PublicKey;
  wallet?: PublicKey;
  skipOracleSign?: boolean;
  getAssetFn?: (url: string, assetId: PublicKey) => Promise<Asset | undefined>;
  getAssetProofFn?: (
    url: string,
    assetId: PublicKey
  ) => Promise<AssetProof | undefined>;
}) {
  // @ts-ignore
  const asset = await getAssetFn(provider.connection._rpcEndpoint, hotspot);
  if (!asset) {
    throw new Error("No asset with ID " + hotspot.toBase58());
  }

  const recipient = asset.compression.compressed
    ? compressedRecipientKey(
        lazyDistributor,
        asset.compression.tree!,
        asset.compression.leafId!
      )[0]
    : recipientKey(lazyDistributor, hotspot)[0];
  const lazyDistributorAcc = (await program.account.lazyDistributorV0.fetch(
    lazyDistributor
  ))!;
  const rewardsMint = lazyDistributorAcc.rewardsMint!;

  const ixPromises = rewards.map((x, idx) => {
    return program.methods
      .setCurrentRewardsV0({
        currentRewards: new BN(x.currentRewards),
        oracleIndex: idx,
      })
      .accounts({
        lazyDistributor,
        recipient,
        oracle: x.oracleKey,
      })
      .instruction();
  });
  const ixs = await Promise.all(ixPromises);
  let tx = new Transaction();

  const destinationAccount = await getAssociatedTokenAddress(
    rewardsMint,
    asset.ownership.owner,
    true
  );

  if (!(await provider.connection.getAccountInfo(recipient))) {
    const initRecipientIx = await program.methods
      .initializeRecipientV0()
      .accounts({
        lazyDistributor,
        mint: hotspot,
      })
      .instruction();

    tx.add(initRecipientIx);
  }
  tx.add(...ixs);

  tx.recentBlockhash = (
    await provider.connection.getLatestBlockhash()
  ).blockhash;

  tx.feePayer = wallet ? wallet : provider.wallet.publicKey;

  if (asset.compression.compressed) {
    const distributeIx = await (
      await distributeCompressionRewards({
        program,
        assetId: hotspot,
        lazyDistributor,
        getAssetFn,
        getAssetProofFn,
      })
    ).instruction();
    tx.add(distributeIx);
  } else {
    const distributeIx = await program.methods
      .distributeRewardsV0()
      .accounts({
        // @ts-ignore
        common: {
          recipient,
          lazyDistributor,
          rewardsMint,
          owner: asset.ownership.owner,
          destinationAccount,
        },
      })
      .instruction();
    tx.add(distributeIx);
  }
  // @ts-ignore
  const oracleUrls = lazyDistributorAcc.oracles.map((x: any) => x.url);

  let serTx = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  if (!skipOracleSign) {
    for (const oracle of oracleUrls) {
      const res = await axios.post(`${oracle}`, {
        transaction: serTx,
      });
      serTx = Buffer.from(res.data.transaction);
    }
  }

  const finalTx = Transaction.from(serTx);
  // Ensure the oracle didn't pull a fast one
  assertSameIxns(finalTx.instructions, tx.instructions);

  return finalTx;
}

function assertSameIxns(
  instructions: TransactionInstruction[],
  instructions1: TransactionInstruction[]
) {
  if (instructions.length !== instructions1.length) {
    throw new Error("Extra instructions added by oracle");
  }

  instructions.forEach((instruction, idx) => {
    const instruction1 = instructions1[idx];
    if (
      instruction.programId.toBase58() !== instruction1.programId.toBase58()
    ) {
      throw new Error("Program id mismatch");
    }
    if (!instruction.data.equals(instruction1.data)) {
      throw new Error("Instruction data mismatch");
    }

    if (instruction.keys.length !== instruction1.keys.length) {
      throw new Error("Key length mismatch");
    }

    instruction.keys.forEach((key, idx) => {
      const key1 = instruction1.keys[idx];
      if (key.pubkey.toBase58() !== key1.pubkey.toBase58()) {
        throw new Error("Key mismatch");
      }
    });
  });
}
