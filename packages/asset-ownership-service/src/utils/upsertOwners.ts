import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import axios from "axios";
import { Op, Sequelize, Transaction, QueryTypes } from "sequelize";
import { PG_ASSET_TABLE, SOLANA_URL } from "../env";
import database, { AssetOwner } from "./database";
import { chunks, getAssetBatch } from "@helium/spl-utils";
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
  const connection = provider.connection;
  const assetPks: PublicKey[] = (
    (await sequelize.query(`SELECT asset FROM ${PG_ASSET_TABLE};`, {
      type: QueryTypes.SELECT,
    })) as { asset: string }[]
  ).map((row) => new PublicKey(row.asset));

  const batchSize = 1000;
  const limit = pLimit(5);
  const batchPromises: Promise<void>[] = [];
  for (let i = 0; i < assetPks.length; i += batchSize) {
    const assetBatch = assetPks.slice(i, i + batchSize);
    batchPromises.push(
      limit(async () => {
        const assetsWithOwner = (
          (await Promise.all(
            chunks(assetBatch, batchSize).map((chunk) =>
              retry(
                async () =>
                  getAssetBatch(provider.connection.rpcEndpoint, chunk),
                { retries: 5, minTimeout: 1000 }
              )
            )
          )) as { id: PublicKey; ownership: { owner: PublicKey } }[][]
        )
          .flat()
          .map(({ id, ownership }) => ({
            asset: id.toBase58(),
            owner: ownership.owner.toBase58(),
          }));

        const transaction = await sequelize.transaction({
          isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
        });

        await AssetOwner.bulkCreate(assetsWithOwner, {
          transaction,
          updateOnDuplicate: ["asset"],
        });
        await transaction.commit();
      })
    );
  }

  await Promise.all(batchPromises);
};
