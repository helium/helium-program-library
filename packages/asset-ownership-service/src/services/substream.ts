import * as anchor from "@coral-xyz/anchor";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { AddressLookupTableAccount, PublicKey } from "@solana/web3.js";
import {
  applyParams,
  authIssue,
  createAuthInterceptor,
  createRegistry,
  createRequest,
  fetchSubstream,
  isEmptyMessage,
  streamBlocks,
  unpackMapOutput,
} from "@substreams/core";
import { FastifyInstance } from "fastify";
import { Op, QueryTypes, Transaction } from "sequelize";
import {
  PG_MAKER_TABLE,
  PRODUCTION,
  SUBSTREAM,
  SUBSTREAM_API_KEY,
  SUBSTREAM_CURSOR_STALENESS_THRESHOLD_MS,
  SUBSTREAM_URL,
} from "../env";
import { AssetOwner, Cursor, database } from "../utils/database";
import { provider } from "../utils/solana";
import { PROGRAM_ID as BUBBLEGUM_PROGRAM_ID } from "@metaplex-foundation/mpl-bubblegum";
import {
  PROGRAM_ID as HEM_PROGRAM_ID,
  init as initHem,
} from "@helium/helium-entity-manager-sdk";
import { convertSubstreamTransaction } from "../utils/convertSubstreamTransaction";
import { BubblegumIdl } from "../bubblegum";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";

const MODULE = "transactions_by_programid_and_account_without_votes";
const MAX_RECONNECT_ATTEMPTS = 5;
const RELEVENT_INSTRUCTIONS = ["MintToCollectionV1", "Transfer", "CreateTree"];

interface IOutputTransaction {
  message: {
    accountKeys: string[];
    recentBlockhash: string;
    instructions: Array<{
      programIdIndex: number;
      accounts: string;
      data: string;
    }>;
  };
  meta: {
    logMessages: string[];
  };
}

export const CursorManager = (
  service: string,
  stalenessThreshold: number,
  onStale?: () => void
) => {
  const CURSOR_UPDATE_INTERVAL = 30_000;
  let checkInterval: NodeJS.Timeout | undefined;
  let lastReceivedBlock: number = Date.now();
  let pendingCursor: {
    cursor: string;
    blockHeight: string;
    service: string;
  } | null = null;
  let lastCursorUpdate = 0;

  const formatStaleness = (staleness: number): string => {
    const stalenessInHours = staleness / 3600000;
    return stalenessInHours >= 1
      ? `${stalenessInHours.toFixed(1)}h`
      : `${(staleness / 60000).toFixed(1)}m`;
  };

  const getLatestCursor = async (): Promise<Cursor | null> =>
    await Cursor.findOne({
      where: { service },
      order: [["createdAt", "DESC"]],
    });

  const recordBlockReceived = (): void => {
    lastReceivedBlock = Date.now();
  };

  const updateCursor = async ({
    cursor,
    blockHeight,
    force = false,
  }: {
    cursor: string;
    blockHeight: string;
    force?: boolean;
  }): Promise<void> => {
    const now = Date.now();
    recordBlockReceived();
    pendingCursor = { cursor, blockHeight, service };

    if (force || now - lastCursorUpdate >= CURSOR_UPDATE_INTERVAL) {
      if (pendingCursor) {
        await database.transaction(async (t) => {
          await Cursor.upsert(pendingCursor!, {
            conflictFields: ["service"],
            transaction: t,
          });

          await Cursor.destroy({
            where: {
              service,
              cursor: { [Op.ne]: cursor },
            },
            transaction: t,
          });
        });
        lastCursorUpdate = now;
        pendingCursor = null;
      }
    }
  };

  const checkStaleness = async (): Promise<string | undefined> => {
    const connectionStaleness = Date.now() - lastReceivedBlock;
    if (connectionStaleness >= stalenessThreshold) {
      console.log(
        `Connection is stale (${formatStaleness(
          connectionStaleness
        )} since last block)`
      );
      onStale && onStale();
    }

    const cursor = await getLatestCursor();
    return cursor ? cursor.cursor : undefined;
  };

  const startStalenessCheck = (): void => {
    if (checkInterval) clearInterval(checkInterval);
    checkInterval = setInterval(() => checkStaleness(), 30_000);
  };

  const stopStalenessCheck = (): void => {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = undefined;
    }
  };

  return {
    getLatestCursor,
    updateCursor,
    checkStaleness,
    startStalenessCheck,
    stopStalenessCheck,
    recordBlockReceived,
  };
};

export const setupSubstream = async (server: FastifyInstance) => {
  if (!SUBSTREAM_API_KEY) throw new Error("SUBSTREAM_API_KEY undefined");
  if (!SUBSTREAM_URL) throw new Error("SUBSTREAM_URL undefined");
  if (!SUBSTREAM) throw new Error("SUBSTREAM undefined");
  const { token } = await authIssue(SUBSTREAM_API_KEY!);
  const hemProgram = await initHem(provider);
  const substream = await fetchSubstream(SUBSTREAM!);
  const registry = createRegistry(substream);
  const transport = createGrpcTransport({
    baseUrl: SUBSTREAM_URL!,
    httpVersion: "2",
    interceptors: [createAuthInterceptor(token)],
    useBinaryFormat: true,
    jsonOptions: { typeRegistry: registry },
  });

  let merkleTrees: Set<string> = new Set(
    (
      (await database.query(`SELECT merkle_tree FROM ${PG_MAKER_TABLE};`, {
        type: QueryTypes.SELECT,
      })) as { merkle_tree: string }[]
    ).map((row) => row.merkle_tree)
  );

  let isConnecting = false;
  let shouldRestart = false;
  let restartCursor: string | undefined = undefined;
  let currentAbortController: AbortController | null = null;

  const cursorManager = CursorManager(
    "asset_ownership",
    SUBSTREAM_CURSOR_STALENESS_THRESHOLD_MS,
    () => server.customMetrics.staleCursorCounter.inc()
  );

  const coders: {
    [programId: string]: anchor.BorshInstructionCoder;
  } = {
    [HEM_PROGRAM_ID.toBase58()]: new anchor.BorshInstructionCoder(
      await fetchBackwardsCompatibleIdl(HEM_PROGRAM_ID, provider)
    ),
    [BUBBLEGUM_PROGRAM_ID.toBase58()]: new anchor.BorshInstructionCoder(
      BubblegumIdl
    ),
  };

  const connect = async (attemptCount = 1, overrideCursor?: string) => {
    if (currentAbortController) {
      currentAbortController.abort();
    }

    currentAbortController = new AbortController();

    applyParams(
      [
        `${MODULE}=${[...merkleTrees]
          .map(
            (merkleTree) =>
              `program:${BUBBLEGUM_PROGRAM_ID} && account:${merkleTree}`
          )
          .join(" || ")}`,
      ],
      substream.modules!.modules
    );

    if (attemptCount >= MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `Substream failed to connect after ${MAX_RECONNECT_ATTEMPTS} attempts.`
      );
      process.exit(1);
    }

    if (isConnecting) return;
    isConnecting = true;

    try {
      await Cursor.sync({ alter: true });
      const cursor = overrideCursor ?? (await cursorManager.checkStaleness());
      cursorManager.startStalenessCheck();
      console.log("Connected to Substream");
      const currentBlock = await provider.connection.getSlot("finalized");
      const request = createRequest({
        substreamPackage: substream,
        outputModule: MODULE,
        productionMode: PRODUCTION,
        startBlockNum: cursor ? undefined : currentBlock,
        startCursor: cursor,
      });

      console.log(
        `Substream: Streaming from ${
          cursor ? `cursor ${cursor}` : `block ${currentBlock}`
        }`
      );

      attemptCount = 0;
      isConnecting = false;

      for await (const response of streamBlocks(transport, request)) {
        if (currentAbortController.signal.aborted) {
          return;
        }

        if (shouldRestart) {
          shouldRestart = false;
          currentAbortController.abort();
          return;
        }

        const message = response.message;

        if (message.case === "fatalError") {
          console.error("Substream error:", message.value);
          throw new Error("Received fatal error from substream");
        }

        if (message.case === "blockScopedData") {
          const output = unpackMapOutput(response, registry);
          const cursor = message.value.cursor;
          const blockHeight =
            message.value.finalBlockHeight?.toString() || "unknown";

          const hasTransactions =
            output !== undefined &&
            !isEmptyMessage(output) &&
            (output as any).transactions.length > 0;

          const t = await database.transaction({
            isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
          });

          try {
            if (hasTransactions) {
              const outputTransactions = (output as any)
                .transactions as IOutputTransaction[];

              const filteredTransactions = outputTransactions.filter((tx) =>
                tx.meta.logMessages.some((log) =>
                  RELEVENT_INSTRUCTIONS.some((instr) => log.includes(instr))
                )
              );

              if (filteredTransactions.length > 0) {
                const lookupTableCache: Record<
                  string,
                  AddressLookupTableAccount
                > = {};

                await Promise.all(
                  filteredTransactions.map(async (transactionInfo) => {
                    const transaction = await convertSubstreamTransaction(
                      transactionInfo
                    );

                    if (!transaction) return;
                    const { message } = transaction;
                    const { addressTableLookups } = message;
                    const addressLookupTableAccounts: AddressLookupTableAccount[] =
                      [];

                    for (const addressTableLookup of addressTableLookups) {
                      const key = addressTableLookup.accountKey.toBase58();
                      if (!lookupTableCache[key]) {
                        const lookupTableResult =
                          await provider.connection?.getAddressLookupTable(
                            addressTableLookup.accountKey
                          );
                        if (lookupTableResult?.value) {
                          lookupTableCache[key] = lookupTableResult.value;
                        }
                      }
                      if (lookupTableCache[key]) {
                        addressLookupTableAccounts.push(lookupTableCache[key]);
                      }
                    }

                    const { staticAccountKeys, accountKeysFromLookups } =
                      message.getAccountKeys({
                        addressLookupTableAccounts,
                      });

                    const accountKeys = [
                      ...staticAccountKeys,
                      ...(accountKeysFromLookups?.writable || []),
                      ...(accountKeysFromLookups?.readonly || []),
                    ];

                    for (const compiledInstruction of message.compiledInstructions) {
                      const programIdIndex = compiledInstruction.programIdIndex;
                      const programId = new PublicKey(
                        accountKeys[programIdIndex]
                      );

                      const instructionCoder = coders[programId.toBase58()];

                      if (!instructionCoder) continue;

                      const decodedInstruction = instructionCoder.decode(
                        Buffer.from(compiledInstruction.data)
                      );

                      if (!decodedInstruction) continue;

                      const formattedInstruction = instructionCoder.format(
                        decodedInstruction,
                        compiledInstruction.accountKeyIndexes.map((idx) => ({
                          pubkey: new PublicKey(accountKeys[idx]),
                          isSigner: message.isAccountSigner(idx),
                          isWritable: message.isAccountWritable(idx),
                        }))
                      );

                      if (!formattedInstruction) continue;

                      const accountMap = Object.fromEntries(
                        (formattedInstruction.accounts || []).map((acc) => [
                          acc.name,
                          acc,
                        ])
                      );

                      const argMap = Object.fromEntries(
                        (formattedInstruction.args || []).map((arg) => [
                          arg.name,
                          arg,
                        ])
                      );

                      switch (decodedInstruction.name) {
                        case "update_maker_tree_v0":
                          const makerAccount = accountMap["Maker"]?.pubkey;
                          const newTreeAccount =
                            accountMap["New_merkle_tree"]?.pubkey;

                          if (
                            makerAccount &&
                            newTreeAccount &&
                            !merkleTrees.has(newTreeAccount)
                          ) {
                            try {
                              await database.query(
                                `INSERT INTO ${PG_MAKER_TABLE} (address, merkle_tree)
                               VALUES (:address, :merkle_tree)
                               ON CONFLICT (address) DO UPDATE SET merkle_tree = EXCLUDED.merkle_tree;`,
                                {
                                  replacements: {
                                    address: makerAccount.toBase58(),
                                    merkle_tree: newTreeAccount.toBase58(),
                                  },
                                  type: QueryTypes.INSERT,
                                }
                              );

                              merkleTrees.add(newTreeAccount);
                              shouldRestart = true;
                              restartCursor = cursor;

                              await cursorManager.updateCursor({
                                cursor,
                                blockHeight,
                                force: true,
                              });
                            } catch (err) {
                              server.customMetrics.makerTreeFailureCounter.inc();
                              throw err;
                            }

                            return;
                          }
                          break;

                        case "issue_entity_v0": {
                          const recipientAccount =
                            accountMap["Recipient"]?.pubkey;
                          const keyToAssetAccount =
                            accountMap["Key_to_asset"]?.pubkey;

                          if (recipientAccount && keyToAssetAccount) {
                            const keyToAsset =
                              await hemProgram.account.keyToAssetV0.fetch(
                                keyToAssetAccount
                              );

                            if (keyToAsset) {
                              await AssetOwner.upsert(
                                {
                                  asset: keyToAsset.asset.toBase58(),
                                  owner: recipientAccount.toBase58(),
                                },
                                { transaction: t }
                              );
                            }
                          }
                          break;
                        }

                        case "transfer": {
                          const newOwnerAccount =
                            accountMap["New_leaf_owner"]?.pubkey;
                          const merkleTreeAccount =
                            accountMap["Merkle_tree"]?.pubkey;
                          const nonceArg = argMap["nonce"]?.data;

                          if (
                            newOwnerAccount &&
                            merkleTreeAccount &&
                            nonceArg
                          ) {
                            const nonceBuffer = Buffer.alloc(8);
                            nonceBuffer.writeBigUInt64LE(BigInt(nonceArg));

                            const seeds = [
                              Buffer.from("asset", "utf-8"),
                              merkleTreeAccount.toBuffer(),
                              nonceBuffer,
                            ];

                            const [assetId] = PublicKey.findProgramAddressSync(
                              seeds,
                              BUBBLEGUM_PROGRAM_ID
                            );

                            await AssetOwner.upsert(
                              {
                                asset: assetId.toBase58(),
                                owner: newOwnerAccount.toBase58(),
                              },
                              { transaction: t }
                            );
                          }
                          break;
                        }
                      }
                    }
                  })
                );
              }
            }

            await t.commit();
            await cursorManager.updateCursor({
              cursor,
              blockHeight,
              force: hasTransactions,
            });
          } catch (blockErr) {
            await t.rollback();
            throw blockErr;
          }
        }
      }

      if (shouldRestart) {
        shouldRestart = false;
        await connect(1, restartCursor);
      }
    } catch (err) {
      cursorManager.stopStalenessCheck();
      console.log("Substream connection error:", err);
      isConnecting = false;
      handleReconnect(attemptCount + 1);
    }
  };

  const handleReconnect = async (nextAttempt: number) => {
    const baseDelay = 1000;
    const delay =
      nextAttempt === 1 ? 0 : baseDelay * Math.pow(2, nextAttempt - 1);

    setTimeout(() => {
      console.log(
        `Attempting to reconnect (attempt ${nextAttempt} of ${MAX_RECONNECT_ATTEMPTS})...`
      );
      connect(nextAttempt);
    }, delay);
  };

  await connect();
};
