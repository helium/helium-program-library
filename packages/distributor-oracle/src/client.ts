import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  decodeEntityKey,
  init,
  init as initHem,
  keyToAssetKey,
  keyToAssetForAsset,
} from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { RewardsOracle } from "@helium/idls/lib/types/rewards_oracle";
import { distributeCompressionRewards, initializeCompressionRecipient, recipientKey } from "@helium/lazy-distributor-sdk";
import { init as initRewards } from "@helium/rewards-oracle-sdk";
import { Asset, AssetProof, HNT_MINT, getAsset, getAssetProof, truthy } from "@helium/spl-utils";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  PublicKey,
  Transaction, TransactionInstruction
} from "@solana/web3.js";
import axios from "axios";

const HNT = process.env.HNT_MINT ? new PublicKey(process.env.HNT_MINT) : HNT_MINT;
const DAO = daoKey(HNT)[0];

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

export type BulkRewards = {
  currentRewards: Record<string, string>;
  oracleKey: PublicKey;
};
export async function getBulkRewards(
  program: Program<LazyDistributor>,
  lazyDistributor: PublicKey,
  entityKeys: string[]
): Promise<BulkRewards[]> {
  const lazyDistributorAcc = await program.account.lazyDistributorV0.fetch(
    lazyDistributor
  );

  const results = await Promise.all(
    // @ts-ignore
    lazyDistributorAcc.oracles.map((x: any) =>
      axios.post(`${x.url}/bulk-rewards`, { entityKeys })
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

export async function getPendingRewards(
  program: Program<LazyDistributor>,
  lazyDistributor: PublicKey,
  dao: PublicKey,
  entityKeys: string[],
  encoding: BufferEncoding | "b58" = "b58"
): Promise<Record<string, string>> {
  const oracleRewards = await getBulkRewards(
    program,
    lazyDistributor,
    entityKeys
  );

  const hemProgram = await init(program.provider as AnchorProvider);
  const withRecipients = await Promise.all(
    entityKeys.map(async (entityKey) => {
      const keyToAssetK = keyToAssetKey(dao, entityKey, encoding)[0];
      const keyToAsset = await hemProgram.account.keyToAssetV0.fetch(
        keyToAssetK
      );
      const recipient = recipientKey(lazyDistributor, keyToAsset.asset)[0];
      const recipientAcc = await program.account.recipientV0.fetchNullable(
        recipient
      );

      return {
        entityKey,
        recipientAcc,
      };
    })
  );

  return withRecipients.reduce((acc, { entityKey, recipientAcc }) => {
    const sortedOracleRewards = oracleRewards
      .map((rew) => rew.currentRewards[entityKey] || new BN(0))
      .sort((a, b) => new BN(a).sub(new BN(b)).toNumber());

    const oracleMedian = new BN(
      sortedOracleRewards[Math.floor(sortedOracleRewards.length / 2)]
    );

    const subbed = oracleMedian.sub(recipientAcc?.totalRewards || new BN(0));
    acc[entityKey] = subbed.toString();

    return acc;
  }, {} as Record<string, string>);
}

export async function formBulkTransactions({
  program: lazyDistributorProgram,
  rewardsOracleProgram,
  heliumEntityManagerProgram,
  rewards,
  assets,
  compressionAssetAccs,
  lazyDistributor,
  lazyDistributorAcc,
  wallet = (lazyDistributorProgram.provider as AnchorProvider).wallet.publicKey,
  skipOracleSign = false,
  assetEndpoint,
  getAssetFn = getAsset,
  getAssetProofFn = getAssetProof,
}: {
  program: Program<LazyDistributor>;
  rewardsOracleProgram?: Program<RewardsOracle>;
  heliumEntityManagerProgram?: Program<HeliumEntityManager>;
  rewards: BulkRewards[]; // array of bulk rewards fetched from the oracle. Maps entityKey to reward
  assets: PublicKey[];
  compressionAssetAccs?: Asset[]; // Optional override to fetching the compression accounts from the RPC
  lazyDistributorAcc?: any; // Prefetch the lazyDistributor account to avoid hitting the RPC
  lazyDistributor: PublicKey;
  wallet?: PublicKey;
  assetEndpoint?: string;
  skipOracleSign?: boolean;
  getAssetFn?: (url: string, assetId: PublicKey) => Promise<Asset | undefined>;
  getAssetProofFn?: (
    url: string,
    assetId: PublicKey
  ) => Promise<AssetProof | undefined>;
}) {
  if (assets.length > 100) {
    throw new Error("Too many assets, max 100");
  }
  const provider = lazyDistributorProgram.provider as AnchorProvider;

  if (!rewardsOracleProgram) {
    rewardsOracleProgram = await initRewards(provider);
  }
  if (!heliumEntityManagerProgram) {
    heliumEntityManagerProgram = await initHem(provider);
  }
  if (!lazyDistributorAcc) {
    lazyDistributorAcc =
      await lazyDistributorProgram.account.lazyDistributorV0.fetch(
        lazyDistributor
      );
  }

  if (!compressionAssetAccs) {
    compressionAssetAccs = await Promise.all(
      assets.map(async (asset) => {
        // @ts-ignore
        const assetAcc = await getAssetFn(
          assetEndpoint || provider.connection.rpcEndpoint,
          asset
        );
        if (!assetAcc) {
          throw new Error("No asset with ID " + asset.toBase58());
        }
        return assetAcc;
      })
    );
  }
  if (compressionAssetAccs.length != assets.length) {
    throw new Error("Assets not the same length as compressionAssetAccs");
  }

  let recipientKeys = assets.map(
    (asset) => recipientKey(lazyDistributor, asset)[0]
  );
  let recipientAccs =
    await lazyDistributorProgram.account.recipientV0.fetchMultiple(
      recipientKeys
    );

  let ixsPerAsset = await Promise.all(
    recipientAccs.map(async (recipientAcc, idx) => {
      if (!recipientAcc) {
        return [
          await (
            await initializeCompressionRecipient({
              program: lazyDistributorProgram,
              assetId: assets![idx],
              lazyDistributor,
              assetEndpoint,
              owner: wallet,
              // Make the oracle pay for the recipient to avoid newly migrated users not having enough sol to claim rewards
              payer: lazyDistributorAcc.oracles[0].oracle,
              getAssetFn: () => Promise.resolve(compressionAssetAccs![idx]), // cache result so we don't hit again
              getAssetProofFn,
            })
          ).instruction(),
        ];
      }
      return [];
    })
  );

  // construct the set and distribute ixs
  let setAndDistributeIxs = await Promise.all(
    compressionAssetAccs.map(async (assetAcc, idx) => {
      const keyToAssetK = keyToAssetForAsset(assetAcc);
      const keyToAsset = await heliumEntityManagerProgram!.account.keyToAssetV0.fetch(keyToAssetK)
      const entityKey = decodeEntityKey(
        keyToAsset.entityKey,
        keyToAsset.keySerialization
      )!
      const setRewardIxs = (
        await Promise.all(
          rewards.map(async (bulkRewards, oracleIdx) => {
            if (!(entityKey in bulkRewards.currentRewards)) {
              return null;
            }
            return await rewardsOracleProgram!.methods
              .setCurrentRewardsWrapperV1({
                currentRewards: new BN(bulkRewards.currentRewards[entityKey]),
                oracleIndex: oracleIdx,
              })
              .accounts({
                lazyDistributor,
                recipient: recipientKeys[idx],
                keyToAsset: keyToAssetK,
                oracle: bulkRewards.oracleKey,
              })
              .instruction();
          })
        )
      ).filter(truthy);
      if (setRewardIxs.length == 0) {
        return [];
      }
      const distributeIx = await (
        await distributeCompressionRewards({
          program: lazyDistributorProgram,
          assetId: assets![idx],
          lazyDistributor,
          rewardsMint: lazyDistributorAcc.rewardsMint!,
          getAssetFn: () => Promise.resolve(assetAcc), // cache result so we don't hit again
          getAssetProofFn,
          assetEndpoint,
        })
      ).instruction();
      return [...setRewardIxs, distributeIx];
    })
  );

  for (let i = 0; i < setAndDistributeIxs.length; i++) {
    if (setAndDistributeIxs[i].length == 0) {
      continue;
    }
    ixsPerAsset[i].push(...setAndDistributeIxs[i]);
  }
  // filter arrays where init recipient is the only ix
  ixsPerAsset = ixsPerAsset.filter((x) => x.length > 1);

  let blockhash = (await provider.connection.getLatestBlockhash()).blockhash;

  // unsigned txs
  let initialTxs = ixsPerAsset.map((ixs) => {
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet;
    tx.add(...ixs);
    return tx;
  });

  // @ts-ignore
  const oracleUrls = lazyDistributorAcc.oracles.map((x: any) => x.url);

  let serTxs = initialTxs.map((tx) => {
    return tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
  });
  if (!skipOracleSign) {
    for (const oracle of oracleUrls) {
      const res = await axios.post(`${oracle}/bulk-sign`, {
        transactions: serTxs.map((tx) => tx.toJSON().data),
      });
      serTxs = res.data.transactions.map((x: any) => Buffer.from(x));
    }
  }

  const finalTxs = serTxs.map((tx) => Transaction.from(tx));
  // Check instructions are the same
  finalTxs.forEach((finalTx, idx) => {
    assertSameIxns(finalTx.instructions, initialTxs[idx].instructions);
  });

  return finalTxs;
}


export async function formTransaction({
  program: lazyDistributorProgram,
  rewardsOracleProgram,
  provider,
  rewards,
  asset,
  hotspot,
  lazyDistributor,
  wallet = provider.wallet.publicKey,
  skipOracleSign = false,
  assetEndpoint,
  getAssetFn = getAsset,
  getAssetProofFn = getAssetProof,
}: {
  program: Program<LazyDistributor>;
  rewardsOracleProgram?: Program<RewardsOracle>;
  provider: AnchorProvider;
  rewards: Reward[];
  // Must either provider asset or hotspot. Hotspot is legacy.
  asset?: PublicKey;
  hotspot?: PublicKey;
  lazyDistributor: PublicKey;
  wallet?: PublicKey;
  assetEndpoint?: string;
  skipOracleSign?: boolean;
  getAssetFn?: (url: string, assetId: PublicKey) => Promise<Asset | undefined>;
  getAssetProofFn?: (
    url: string,
    assetId: PublicKey
  ) => Promise<AssetProof | undefined>;
}) {
  if (!asset && !hotspot) {
    throw new Error("Must provide asset or hotspot");
  }
  if (!asset) {
    asset = hotspot!;
  }
  if (!rewardsOracleProgram) {
    rewardsOracleProgram = await initRewards(
      lazyDistributorProgram.provider as AnchorProvider
    );
  }

  const assetAcc = await getAssetFn(
    assetEndpoint || provider.connection.rpcEndpoint,
    asset
  );
  if (!assetAcc) {
    throw new Error("No asset with ID " + asset.toBase58());
  }

  const keyToAsset = keyToAssetForAsset(assetAcc);
  const recipient = recipientKey(lazyDistributor, asset)[0];
  const lazyDistributorAcc =
    (await lazyDistributorProgram.account.lazyDistributorV0.fetch(
      lazyDistributor
    ))!;
  const rewardsMint = lazyDistributorAcc.rewardsMint!;

  let tx = new Transaction();

  const destinationAccount = await getAssociatedTokenAddress(
    rewardsMint,
    assetAcc.ownership.owner,
    true
  );

  if (!(await provider.connection.getAccountInfo(recipient))) {
    let initRecipientIx;
    if (assetAcc.compression.compressed) {
      initRecipientIx = await (
        await initializeCompressionRecipient({
          program: lazyDistributorProgram,
          assetId: asset,
          lazyDistributor,
          assetEndpoint,
          owner: wallet,
          // Make the oracle pay for the recipient to avoid newly migrated users not having enough sol to claim rewards
          payer: lazyDistributorAcc.oracles[0].oracle,
          getAssetFn: () => Promise.resolve(assetAcc), // cache result so we don't hit again
          getAssetProofFn,
        })
      ).instruction();
    } else {
      initRecipientIx = await lazyDistributorProgram.methods
        .initializeRecipientV0()
        .accounts({
          lazyDistributor,
          mint: asset,
        })
        .instruction();
    }

    tx.add(initRecipientIx);
  }

  const ixPromises = rewards.map((x, idx) => {
    return rewardsOracleProgram!.methods
      .setCurrentRewardsWrapperV1({
        currentRewards: new BN(x.currentRewards),
        oracleIndex: idx,
      })
      .accounts({
        lazyDistributor,
        recipient,
        keyToAsset,
        oracle: x.oracleKey,
      })
      .instruction();
  });
  const ixs = await Promise.all(ixPromises);
  tx.add(...ixs);

  tx.recentBlockhash = (
    await provider.connection.getLatestBlockhash()
  ).blockhash;

  tx.feePayer = wallet ? wallet : provider.wallet.publicKey;

  if (assetAcc.compression.compressed) {
    const distributeIx = await (
      await distributeCompressionRewards({
        program: lazyDistributorProgram,
        assetId: asset,
        lazyDistributor,
        getAssetFn: () => Promise.resolve(assetAcc), // cache result so we don't hit again
        getAssetProofFn,
        assetEndpoint,
      })
    ).instruction();
    tx.add(distributeIx);
  } else {
    const distributeIx = await lazyDistributorProgram.methods
      .distributeRewardsV0()
      .accounts({
        // @ts-ignore
        common: {
          recipient,
          lazyDistributor,
          rewardsMint,
          owner: assetAcc.ownership.owner,
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
