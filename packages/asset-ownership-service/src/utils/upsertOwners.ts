import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Sequelize, Transaction, QueryTypes } from "sequelize";
import { PG_ASSET_TABLE, SOLANA_URL } from "../env";
import database, { AssetOwner } from "./database";
import { chunks, getAssetBatch, truthy } from "@helium/spl-utils";
import retry from "async-retry";
import pLimit from "p-limit";

export const upsertOwners = async ({
  sequelize = database,
}: {
  sequelize?: Sequelize;
}) => {
  anchor.setProvider(
    anchor.AnchorProvider.local(process.env.ANCHOR_PROVIDER_URL || SOLANA_URL)
  );
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const assetPks: PublicKey[] = (
    (await sequelize.query(`SELECT asset FROM ${PG_ASSET_TABLE};`, {
      type: QueryTypes.SELECT,
    })) as { asset: string }[]
  ).map((row) => new PublicKey(row.asset));

  console.log(`Processing ${assetPks.length} assets for ownership updates`);

  // Get current block once for all batches
  let lastBlock: number | null = null;
  try {
    lastBlock = await retry(() => provider.connection.getSlot("finalized"), {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 5000,
    });
    console.log(`Using block: ${lastBlock}`);
  } catch (error) {
    console.warn("Failed to fetch block after retries:", error);
  }

  const batchSize = 1000;
  const limit = pLimit(20);
  let processedCount = 0;

  const batchPromises = chunks(assetPks, batchSize).map(
    (assetBatch, batchIndex) =>
      limit(async () => {
        try {
          const assetsWithOwner = (
            (await retry(
              async () =>
                getAssetBatch(provider.connection.rpcEndpoint, assetBatch),
              { retries: 5, minTimeout: 1000 }
            )) as { id: PublicKey; ownership: { owner: PublicKey } }[]
          )
            .filter(truthy)
            .map(({ id, ownership }) => ({
              asset: id.toBase58(),
              owner: ownership.owner.toBase58(),
              lastBlock,
            }));

          const transaction = await sequelize.transaction({
            isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
          });

          try {
            await AssetOwner.bulkCreate(assetsWithOwner, {
              transaction,
              updateOnDuplicate: ["asset", "owner", "lastBlock"],
            });

            await transaction.commit();

            processedCount += assetBatch.length;
          } catch (err) {
            await transaction.rollback();
            throw err;
          }
        } catch (err) {
          console.error(`Error processing batch ${batchIndex + 1}:`, err);
          throw err;
        }
      })
  );

  await Promise.all(batchPromises);
  console.log(
    `Finished processing ${assetPks.length} assets for ownership updates`
  );
};
