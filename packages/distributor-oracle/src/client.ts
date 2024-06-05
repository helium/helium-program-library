import { AnchorProvider, BN, IdlAccounts, Program } from "@coral-xyz/anchor";
import { getSingleton } from "@helium/account-fetch-cache";
import {
  decodeEntityKey,
  init,
  init as initHem,
  keyToAssetForAsset,
  keyToAssetKey,
} from "@helium/helium-entity-manager-sdk";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { RewardsOracle } from "@helium/idls/lib/types/rewards_oracle";
import {
  distributeCompressionRewards,
  initializeCompressionRecipient,
  recipientKey,
} from "@helium/lazy-distributor-sdk";
import { init as initRewards } from "@helium/rewards-oracle-sdk";
import {
  Asset,
  AssetProof,
  HELIUM_COMMON_LUT,
  HELIUM_COMMON_LUT_DEVNET,
  HNT_MINT,
  batchInstructionsToTxsWithPriorityFee,
  getAsset,
  getAssetBatch,
  getAssetProof,
  getAssetProofBatch,
  populateMissingDraftInfo,
  toVersionedTx,
  truthy,
  withPriorityFees,
} from "@helium/spl-utils";
import {
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  AddressLookupTableAccount,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import axios from "axios";

const HNT = process.env.HNT_MINT
  ? new PublicKey(process.env.HNT_MINT)
  : HNT_MINT;

const RECIPIENT_EXISTS_CU = 200000;
const MISSING_RECIPIENT_CU = 400000;

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
  encoding: BufferEncoding | "b58" = "b58",
  forceRequery = false
): Promise<Record<string, string>> {
  const oracleRewards = await getBulkRewards(
    program,
    lazyDistributor,
    entityKeys
  );

  const hemProgram = await init(program.provider as AnchorProvider);
  const cache = await getSingleton(hemProgram.provider.connection);
  const keyToAssetKs = entityKeys.map((entityKey) => {
    return keyToAssetKey(dao, entityKey, encoding)[0];
  });

  const keyToAssets = await cache.searchMultiple(
    keyToAssetKs,
    (pubkey, account) => ({
      pubkey,
      account,
      info: hemProgram.coder.accounts.decode<
        IdlAccounts<HeliumEntityManager>["keyToAssetV0"]
      >("KeyToAssetV0", account.data),
    }),
    true,
    false
  );
  keyToAssets.forEach((kta, index) => {
    if (!kta?.info) {
      throw new Error(
        `Key to asset account not found for entity key ${entityKeys[index]}`
      );
    }
  });
  const recipientKs = keyToAssets.map(
    (keyToAsset) => recipientKey(lazyDistributor, keyToAsset!.info!.asset)[0]
  );
  const recipients = await cache.searchMultiple(
    recipientKs,
    (pubkey, account) => ({
      pubkey,
      account,
      info: program.coder.accounts.decode<
        IdlAccounts<LazyDistributor>["recipientV0"]
      >("RecipientV0", account.data),
    }),
    false,
    forceRequery
  );
  const withRecipients = recipients.map((recipient, index) => {
    return {
      entityKey: entityKeys[index],
      recipientAcc: recipient?.info,
    };
  });

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
  skipOracleSign = false,
  rewards,
  assets,
  compressionAssetAccs,
  lazyDistributor,
  lazyDistributorAcc,
  wallet = (lazyDistributorProgram.provider as AnchorProvider).wallet.publicKey,
  payer = (lazyDistributorProgram.provider as AnchorProvider).wallet.publicKey,
  assetEndpoint,
  getAssetBatchFn = getAssetBatch,
  getAssetProofBatchFn = getAssetProofBatch,
  basePriorityFee,
  isDevnet: isDevnetIn,
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
  payer?: PublicKey;
  basePriorityFee?: number;

  getAssetBatchFn?: (
    url: string,
    assetIds: PublicKey[]
  ) => Promise<Asset[] | undefined>;
  getAssetProofBatchFn?: (
    url: string,
    assetIds: PublicKey[]
  ) => Promise<Record<string, AssetProof> | undefined>;
  isDevnet?: boolean;
}) {
  if (assets.length > 100) {
    throw new Error("Too many assets, max 100");
  }
  const provider = lazyDistributorProgram.provider as AnchorProvider;
  const isDevnet =
    isDevnetIn ||
    provider.connection.rpcEndpoint.includes("test") ||
    provider.connection.rpcEndpoint.includes("devnet");

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
    compressionAssetAccs = await getAssetBatchFn(
      assetEndpoint || provider.connection.rpcEndpoint,
      assets
    );
  }
  if (compressionAssetAccs?.length != assets.length) {
    throw new Error("Assets not the same length as compressionAssetAccs");
  }

  let recipientKeys = assets.map(
    (asset) => recipientKey(lazyDistributor, asset)[0]
  );
  const cache = await getSingleton(
    heliumEntityManagerProgram!.provider.connection
  );
  const recipientAccs = (
    await cache.searchMultiple(recipientKeys, (pubkey, account) => ({
      pubkey,
      account,
      info: lazyDistributorProgram.coder.accounts.decode<
        IdlAccounts<LazyDistributor>["recipientV0"]
      >("RecipientV0", account.data),
    }))
  ).map((x) => x?.info);
  const assetProofsById = await getAssetProofBatchFn(
    assetEndpoint || provider.connection.rpcEndpoint,
    assets
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
              payer,
              getAssetFn: () => Promise.resolve(compressionAssetAccs![idx]), // cache result so we don't hit again
              getAssetProofFn: assetProofsById
                ? () =>
                    Promise.resolve(
                      assetProofsById[compressionAssetAccs![idx].id.toBase58()]
                    )
                : undefined,
            })
          ).instruction(),
        ];
      }
      return [];
    })
  );

  const keyToAssetKs = compressionAssetAccs.map((assetAcc, idx) => {
    return keyToAssetForAsset(assetAcc);
  });
  const keyToAssets = await cache.searchMultiple(
    keyToAssetKs,
    (pubkey, account) => ({
      pubkey,
      account,
      info: heliumEntityManagerProgram!.coder.accounts.decode<
        IdlAccounts<HeliumEntityManager>["keyToAssetV0"]
      >("KeyToAssetV0", account.data),
    }),
    true,
    false
  );
  // construct the set and distribute ixs
  const setAndDistributeIxs = await Promise.all(
    compressionAssetAccs.map(async (assetAcc, idx) => {
      const keyToAssetK = keyToAssets[idx]?.pubkey;
      const keyToAsset = keyToAssets[idx]?.info;
      if (!keyToAsset || !keyToAssetK) {
        return [];
      }
      const inits = ixsPerAsset[idx];
      const entityKey = decodeEntityKey(
        keyToAsset.entityKey,
        keyToAsset.keySerialization
      )!;
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
      let distributeIx;
      if (
        recipientAccs[idx] &&
        recipientAccs[idx]?.destination &&
        !recipientAccs[idx]?.destination.equals(PublicKey.default)
      ) {
        const destination = recipientAccs[idx]!.destination;
        distributeIx = await lazyDistributorProgram.methods
          .distributeCustomDestinationV0()
          .accounts({
            common: {
              payer,
              recipient: recipientKeys[idx],
              lazyDistributor,
              rewardsMint: lazyDistributorAcc.rewardsMint!,
              owner: assetAcc.ownership.owner,
              destinationAccount: getAssociatedTokenAddressSync(
                lazyDistributorAcc.rewardsMint!,
                destination,
                true
              ),
            },
          })
          .instruction();
      } else {
        distributeIx = await (
          await distributeCompressionRewards({
            program: lazyDistributorProgram,
            assetId: assets![idx],
            lazyDistributor,
            rewardsMint: lazyDistributorAcc.rewardsMint!,
            getAssetFn: () => Promise.resolve(assetAcc), // cache result so we don't hit again
            getAssetProofFn: assetProofsById
              ? () =>
                  Promise.resolve(
                    assetProofsById[compressionAssetAccs![idx].id.toBase58()]
                  )
              : undefined,
            assetEndpoint,
          })
        ).instruction();
      }
      const ret = [...inits, ...setRewardIxs, distributeIx];
      // filter arrays where init recipient is the only ix
      if (ret.length > 1) {
        return ret;
      }

      return [];
    })
  );

  // unsigned txs
  const initialTxDrafts = await batchInstructionsToTxsWithPriorityFee(
    provider,
    setAndDistributeIxs,
    {
      basePriorityFee,
      addressLookupTableAddresses: [
        isDevnet ? HELIUM_COMMON_LUT_DEVNET : HELIUM_COMMON_LUT,
      ],
    }
  );
  const initialTxs = initialTxDrafts.map(toVersionedTx);

  // @ts-ignore
  const oracleUrls = lazyDistributorAcc.oracles.map((x: any) => x.url);

  let serTxs = initialTxs.map((tx) => {
    return tx.serialize();
  });
  if (!skipOracleSign) {
    for (const oracle of oracleUrls) {
      const res = await axios.post(`${oracle}/bulk-sign`, {
        transactions: serTxs.map((tx) => Buffer.from(tx).toJSON().data),
      });
      serTxs = res.data.transactions.map((x: any) => Buffer.from(x));
    }
  }

  const finalTxs = serTxs.map((tx) => VersionedTransaction.deserialize(tx));
  // Check instructions are the same
  finalTxs.forEach((finalTx, idx) => {
    assertSameTx(
      finalTx,
      initialTxs[idx],
      initialTxDrafts[0]?.addressLookupTables
    );
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
  payer = provider.wallet.publicKey,
  skipOracleSign = false,
  assetEndpoint,
  getAssetFn = getAsset,
  getAssetProofFn = getAssetProof,
  basePriorityFee,
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
  payer?: PublicKey;
  assetEndpoint?: string;
  skipOracleSign?: boolean;
  basePriorityFee?: number;
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

  const destinationAccount = await getAssociatedTokenAddress(
    rewardsMint,
    assetAcc.ownership.owner,
    true
  );

  let instructions: TransactionInstruction[] = [];
  const recipientAcc =
    await lazyDistributorProgram.account.recipientV0.fetchNullable(recipient);
  if (!recipientAcc) {
    let initRecipientIx;
    if (assetAcc.compression.compressed) {
      initRecipientIx = await (
        await initializeCompressionRecipient({
          program: lazyDistributorProgram,
          assetId: asset,
          lazyDistributor,
          assetEndpoint,
          owner: wallet,
          payer,
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

    instructions.push(initRecipientIx);
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
  instructions.push(...ixs);

  if (
    recipientAcc &&
    recipientAcc?.destination &&
    !recipientAcc?.destination.equals(PublicKey.default)
  ) {
    const destination = recipientAcc.destination;
    instructions.push(
      await lazyDistributorProgram.methods
        .distributeCustomDestinationV0()
        .accounts({
          // @ts-ignore
          common: {
            payer,
            recipient,
            lazyDistributor,
            rewardsMint,
            owner: destination,
            destinationAccount: getAssociatedTokenAddressSync(
              rewardsMint,
              destination,
              true
            ),
          },
        })
        .instruction()
    );
  } else if (assetAcc.compression.compressed) {
    const distributeIx = await (
      await distributeCompressionRewards({
        program: lazyDistributorProgram,
        assetId: asset,
        lazyDistributor,
        getAssetFn: () => Promise.resolve(assetAcc), // cache result so we don't hit again
        getAssetProofFn,
        assetEndpoint,
        payer,
      })
    ).instruction();
    instructions.push(distributeIx);
  } else {
    const distributeIx = await lazyDistributorProgram.methods
      .distributeRewardsV0()
      .accounts({
        // @ts-ignore
        common: {
          payer,
          recipient,
          lazyDistributor,
          rewardsMint,
          owner: assetAcc.ownership.owner,
          destinationAccount,
        },
      })
      .instruction();
    instructions.push(distributeIx);
  }

  const fullDraft = await populateMissingDraftInfo(provider.connection, {
    instructions,
    feePayer: payer ? payer : provider.wallet.publicKey,
  });
  instructions = await withPriorityFees({
    connection: provider.connection,
    basePriorityFee,
    ...fullDraft,
  });
  const tx = toVersionedTx({
    ...fullDraft,
    instructions,
  });
  // @ts-ignore
  const oracleUrls = lazyDistributorAcc.oracles.map((x: any) => x.url);

  let serTx = tx.serialize();
  if (!skipOracleSign) {
    for (const oracle of oracleUrls) {
      const res = await axios.post(`${oracle}`, {
        transaction: Buffer.from(serTx).toJSON(),
      });
      serTx = Buffer.from(res.data.transaction);
    }
  }

  const finalTx = VersionedTransaction.deserialize(serTx);
  // Ensure the oracle didn't pull a fast one
  assertSameTx(finalTx, tx);

  return finalTx;
}

function assertSameTx(
  tx: VersionedTransaction,
  tx1: VersionedTransaction,
  luts: AddressLookupTableAccount[] = []
) {
  if (
    tx.message.compiledInstructions.length !==
    tx1.message.compiledInstructions.length
  ) {
    throw new Error("Extra instructions added by oracle");
  }

  tx.message.compiledInstructions.forEach((instruction, idx) => {
    const instruction1 = tx1.message.compiledInstructions[idx];
    if (instruction.programIdIndex !== instruction1.programIdIndex) {
      throw new Error("Program id mismatch");
    }
    if (!Buffer.from(instruction.data).equals(Buffer.from(instruction1.data))) {
      throw new Error("Instruction data mismatch");
    }

    if (
      instruction.accountKeyIndexes.length !==
      instruction1.accountKeyIndexes.length
    ) {
      throw new Error("Key length mismatch");
    }

    instruction.accountKeyIndexes.forEach((key, idx) => {
      const key1 = instruction1.accountKeyIndexes[idx];
      if (key !== key1) {
        throw new Error("Key mismatch");
      }
    });
  });

  const keys = tx.message
    .getAccountKeys({ addressLookupTableAccounts: luts })
    .keySegments()
    .reduce((acc, cur) => acc.concat(cur), []);
  const keys1 = tx1.message
    .getAccountKeys({
      addressLookupTableAccounts: luts,
    })
    .keySegments()
    .reduce((acc, cur) => acc.concat(cur), []);
  if (keys1.length !== keys.length) {
    throw new Error("Account keys do not match");
  }

  for (let i = 0; i < keys.length; i++) {
    if (!keys[i].equals(keys1[i])) {
      throw new Error("Account key mismatch");
    }
  }
}
