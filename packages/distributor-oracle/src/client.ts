import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { init, keyToAssetKey } from "@helium/helium-entity-manager-sdk";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { RewardsOracle } from "@helium/idls/lib/types/rewards_oracle";
import { distributeCompressionRewards, initializeCompressionRecipient, recipientKey } from "@helium/lazy-distributor-sdk";
import { Asset, AssetProof, getAsset, getAssetProof } from "@helium/spl-utils";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  PublicKey,
  Transaction, TransactionInstruction
} from "@solana/web3.js";
import axios from "axios";
import { HNT_MINT } from "@helium/spl-utils";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

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
): Promise<Record<string, string>> {
  const oracleRewards = await getBulkRewards(
    program,
    lazyDistributor,
    entityKeys
  );

  const hemProgram = await init(program.provider as AnchorProvider);
  const withRecipients = await Promise.all(entityKeys.map(async entityKey => {
    const keyToAssetK = keyToAssetKey(dao, entityKey)[0];
    const keyToAsset = await hemProgram.account.keyToAssetV0.fetch(keyToAssetK);
    const recipient = recipientKey(lazyDistributor, keyToAsset.asset)[0];
    const recipientAcc = await program.account.recipientV0.fetchNullable(recipient);

    return {
      entityKey,
      recipientAcc,
    };
  }))

  return withRecipients.reduce((acc, { entityKey, recipientAcc }) => {
    const sortedOracleRewards = oracleRewards
      .map((rew) => rew.currentRewards[entityKey] || new BN(0))
      .sort((a, b) => new BN(a).sub(new BN(b)).toNumber());

    const oracleMedian = new BN(
      sortedOracleRewards[Math.floor(sortedOracleRewards.length / 2)]
    );

    const subbed = oracleMedian.sub(recipientAcc?.totalRewards || new BN(0));
    acc[entityKey] = subbed.toString()

    return acc;
  }, {} as Record<string, string>);
}


export async function formTransaction({
  lazyDistributorProgram,
  rewardsOracleProgram,
  provider,
  rewards,
  hotspot,
  entityKey,
  lazyDistributor,
  wallet = provider.wallet.publicKey,
  skipOracleSign = false,
  assetEndpoint,
  getAssetFn = getAsset,
  getAssetProofFn = getAssetProof,
}: {
  lazyDistributorProgram: Program<LazyDistributor>;
  rewardsOracleProgram: Program<RewardsOracle>;
  provider: AnchorProvider;
  rewards: Reward[];
  hotspot: PublicKey;
  entityKey: string;
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
  // @ts-ignore
  const asset = await getAssetFn(assetEndpoint || provider.connection._rpcEndpoint, hotspot);
  if (!asset) {
    throw new Error("No asset with ID " + hotspot.toBase58());
  }

  const recipient = recipientKey(lazyDistributor, hotspot)[0];
  const lazyDistributorAcc = (await lazyDistributorProgram.account.lazyDistributorV0.fetch(
    lazyDistributor
  ))!;
  const rewardsMint = lazyDistributorAcc.rewardsMint!;

  let tx = new Transaction();

  const destinationAccount = await getAssociatedTokenAddress(
    rewardsMint,
    asset.ownership.owner,
    true
  );

  if (!(await provider.connection.getAccountInfo(recipient))) {
    let initRecipientIx;
    if (asset.compression.compressed) {
      initRecipientIx = await(
        await initializeCompressionRecipient({
          program: lazyDistributorProgram,
          assetId: hotspot,
          lazyDistributor,
          assetEndpoint,
          owner: wallet,
          // Make the oracle pay for the recipient to avoid newly migrated users not having enough sol to claim rewards
          payer: lazyDistributorAcc.oracles[0].oracle,
          getAssetFn: () => Promise.resolve(asset), // cache result so we don't hit again
          getAssetProofFn,
        })
      ).instruction();
    } else {
      initRecipientIx = await lazyDistributorProgram.methods
        .initializeRecipientV0()
        .accounts({
          lazyDistributor,
          mint: hotspot,
        })
        .instruction();
    }

    tx.add(initRecipientIx);
  }

  const keyToAsset = keyToAssetKey(DAO, entityKey)[0]
  const ixPromises = rewards.map((x, idx) => {
    return rewardsOracleProgram.methods
      .setCurrentRewardsWrapperV0({
        entityKey: Buffer.from(bs58.decode(entityKey)),
        currentRewards: new BN(x.currentRewards),
        oracleIndex: idx,
      })
      .accounts({
        lazyDistributor,
        recipient,
        keyToAsset,
      })
      .instruction();
  });
  const ixs = await Promise.all(ixPromises);
  tx.add(...ixs);

  tx.recentBlockhash = (
    await provider.connection.getLatestBlockhash()
  ).blockhash;

  tx.feePayer = wallet ? wallet : provider.wallet.publicKey;

  if (asset.compression.compressed) {
    const distributeIx = await(
      await distributeCompressionRewards({
        program: lazyDistributorProgram,
        assetId: hotspot,
        lazyDistributor,
        getAssetFn: () => Promise.resolve(asset), // cache result so we don't hit again
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
