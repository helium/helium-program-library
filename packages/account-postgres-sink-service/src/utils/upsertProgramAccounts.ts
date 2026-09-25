import * as anchor from "@coral-xyz/anchor";
import { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import retry from "async-retry";
import { ModelStatic, Op, Sequelize, Transaction } from "sequelize";
import { SOLANA_URL } from "../env";
import { initPlugins } from "../plugins";
import { IAccountConfig, IInitedPlugin } from "../types";
import cachedIdlFetch from "./cachedIdlFetch";
import { database } from "./database";
import { defineIdlModels } from "./defineIdlModels";
import { sanitizeAccount } from "./sanitizeAccount";
import { truthy } from "./truthy";
import { lowerFirstChar } from "@helium/spl-utils";
import { processProgramAccounts } from "./processProgramAccounts";
import { hasAccountChanged } from "./hasAccountChanged";

interface UpsertProgramAccountsArgs {
  programId: PublicKey;
  accounts: IAccountConfig[];
  sequelize?: Sequelize;
}

export const makeUpsertChunk =
  ({
    model,
    decode,
    plugins,
    now,
    type,
  }: {
    model: ModelStatic<any>;
    decode: (data: Buffer) => any;
    plugins: (IInitedPlugin | undefined)[];
    now: string;
    type: string;
  }) =>
  async (
    chunk: anchor.web3.GetProgramAccountsResponse,
    transaction: Transaction,
    lastBlock: number
  ): Promise<string[]> => {
    let decodeErrors = 0;

    const accs = (
      await Promise.all(
        chunk.map(async ({ pubkey, account }) => {
          try {
            const data =
              Array.isArray(account.data) &&
              account.data[1] === "base64"
                ? Buffer.from(account.data[0], "base64")
                : account.data;

            const decodedAcc = decode(data);

            return {
              publicKey: pubkey,
              account: decodedAcc,
            };
          } catch (_e) {
            decodeErrors++;
            if (decodeErrors <= 3) {
              // Only log first 3 decode errors to avoid spam
              console.error(`Decode error ${pubkey}:`, _e);
            }
            return null;
          }
        })
      )
    ).filter(truthy);

    if (decodeErrors > 0) {
      console.log(
        `${type} batch: ${accs.length} successful decodes, ${decodeErrors} decode errors out of ${chunk.length} accounts`
      );
    }

    // Skip processing if no accounts were successfully decoded
    if (accs.length === 0) {
      console.warn(
        `Skipping batch processing for ${type} - no accounts successfully decoded`
      );
      return [];
    }

    const updateOnDuplicateFields: string[] = [
      ...Object.keys(accs[0].account),
      ...new Set(
        plugins
          .map((plugin) => plugin?.updateOnDuplicateFields || [])
          .flat()
      ),
    ];

    // Fetch existing records to compare
    const addresses = accs.map(({ publicKey }) => publicKey);
    const existingRecords = await model.findAll({
      where: { address: addresses },
      transaction,
      raw: true,
    });

    const existingRecordMap = new Map(
      existingRecords.map((record: any) => [record.address, record])
    );

    const results = await Promise.all(
      accs.map(async ({ publicKey, account }) => {
        let sanitizedAccount = sanitizeAccount(account);

        for (const plugin of plugins) {
          if (plugin?.processAccount) {
            sanitizedAccount = await plugin.processAccount(
              { ...sanitizedAccount, address: publicKey },
              transaction,
              lastBlock
            );
          }
        }

        const newRecord = {
          address: publicKey,
          refreshedAt: now,
          ...sanitizedAccount,
        };

        const existingRecord = existingRecordMap.get(publicKey);
        const shouldUpdate = hasAccountChanged(
          newRecord,
          existingRecord
        );

        if (shouldUpdate) {
          return {
            record: {
              ...newRecord,
              lastBlock,
            },
            shouldUpdate: true,
          };
        } else {
          return {
            record: {
              ...newRecord,
              lastBlock: existingRecord?.lastBlock || lastBlock,
            },
            shouldUpdate: false,
          };
        }
      })
    );

    const toUpdate = results
      .filter((r) => r.shouldUpdate)
      .map((r) => r.record);

    const toTouch = results
      .filter((r) => !r.shouldUpdate)
      .map((r) => r.record);

    if (toUpdate.length > 0) {
      const UPSERT_CHUNK_SIZE = 5000;
      for (let i = 0; i < toUpdate.length; i += UPSERT_CHUNK_SIZE) {
        await model.bulkCreate(
          toUpdate.slice(i, i + UPSERT_CHUNK_SIZE),
          {
            updateOnDuplicate: [
              "address",
              "refreshedAt",
              "lastBlock",
              ...updateOnDuplicateFields,
            ],
            transaction,
          }
        );
      }
    }

    if (toTouch.length > 0) {
      await model.bulkCreate(toTouch, {
        transaction,
        updateOnDuplicate: ["address", "refreshedAt"],
      });
    }

    // Only changed rows take the new stamp; restamping touched rows
    // would republish rows that did not change.
    return toUpdate.map((r) => r.address.toString());
  };

export const upsertProgramAccounts = async ({
  programId,
  accounts,
  sequelize = database,
}: UpsertProgramAccountsArgs) => {
  anchor.setProvider(
    anchor.AnchorProvider.local(process.env.ANCHOR_PROVIDER_URL || SOLANA_URL)
  );
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const connection = provider.connection;
  const idl = await cachedIdlFetch.fetchIdl({
    skipCache: true,
    programId: programId.toBase58(),
    provider,
  });

  if (!idl) {
    throw new Error(`unable to fetch idl for ${programId}`);
  }

  if (
    !accounts.every(({ type }) =>
      idl.accounts!.some(({ name }) => name === type)
    )
  ) {
    throw new Error("idl does not have every account type");
  }

  const program = new anchor.Program(idl, provider);

  try {
    await sequelize.authenticate();
    await defineIdlModels({
      idl,
      accounts,
      sequelize,
    });
  } catch (e) {
    console.log(e);
    throw e;
  }

  for (const { type, batchSize = 50000, ...rest } of accounts) {
    try {
      const model = sequelize.models[type];
      const plugins = await initPlugins(rest.plugins);

      const hasGeocodingPlugin = rest.plugins?.some(
        (p) => p.type === "ExtractHexLocation"
      );

      const effectiveBatchSize = hasGeocodingPlugin
        ? Math.min(batchSize, 25000)
        : batchSize;

      console.log(
        `Using batch size ${effectiveBatchSize} for ${type} accounts${
          hasGeocodingPlugin ? " (reduced due to geocoding)" : ""
        }`
      );

      const filter = program.coder.accounts.memcmp(
        lowerFirstChar(type),
        undefined
      );
      const coderFilters: GetProgramAccountsFilter[] = [];

      if (filter?.offset != undefined && filter?.bytes != undefined) {
        coderFilters.push({
          memcmp: {
            offset: filter.offset,
            bytes: filter.bytes,
          },
        });
      }

      if (filter?.dataSize != undefined) {
        coderFilters.push({ dataSize: filter.dataSize });
      }

      const now = new Date().toISOString();
      const decode = (data: Buffer) =>
        program.coder.accounts.decode(lowerFirstChar(type), data);
      // Add retry wrapper for the entire account processing
      const processedCount = await retry(
        async () => {
          const count = await processProgramAccounts(
            sequelize,
            connection,
            programId,
            type,
            coderFilters,
            effectiveBatchSize,
            makeUpsertChunk({ model, decode, plugins, now, type })
          );

          // Throw error if no accounts processed to trigger retry
          if (count === 0 && !rest.ignore_deletes) {
            throw new Error(
              `No accounts processed for type ${type} - retrying`
            );
          }

          return count;
        },
        {
          retries: 3,
          factor: 2,
          minTimeout: 2000,
          maxTimeout: 10000,
          onRetry: (err: any, attempt: any) => {
            console.warn(
              `Retrying account processing for ${type}, attempt #${attempt}: ${err.message}`
            );
          },
        }
      );

      // Only delete old records if we actually processed some accounts
      if (!rest.ignore_deletes && processedCount > 0) {
        console.log(`Cleaning up old ${type} records that were not refreshed`);
        const deletedCount = await model.destroy({
          where: {
            refreshedAt: {
              [Op.lt]: now,
            },
          },
        });
        console.log(`Deleted ${deletedCount} old ${type} records`);
      } else if (!rest.ignore_deletes && processedCount === 0) {
        // This would only trigger after all retries are exhausted
        console.error(
          `ERROR: Failed to process any ${type} accounts after retries. This indicates a persistent issue with account fetching.`
        );
      }
    } catch (err) {
      console.error(`Error processing account type ${type}:`, err);
    }
  }
};
