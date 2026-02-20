import { createGrpcTransport } from "@connectrpc/connect-node";
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
import { PROGRAM_ID as BUBBLEGUM_PROGRAM_ID } from "@metaplex-foundation/mpl-bubblegum";
import {
  PRODUCTION,
  SUBSTREAM,
  SUBSTREAM_API_KEY,
  SUBSTREAM_CURSOR_STALENESS_THRESHOLD_MS,
  SUBSTREAM_URL,
} from "../env";
import { convertSubstreamTransaction } from "../utils/convertSubstreamTransaction";
import { CursorManager } from "../utils/cursor";
import database, { Cursor } from "../utils/database";
import { TransactionProcessor } from "../utils/processTransaction";
import { provider } from "../utils/solana";

const MODULE = "transactions_by_programid_and_account_without_votes";
const MAX_RECONNECT_ATTEMPTS = 5;
const RELEVANT_INSTRUCTIONS = ["MintToCollectionV1", "Transfer", "CreateTree"];
const RELEVANT_INSTRUCTIONS_REGEX = new RegExp(
  RELEVANT_INSTRUCTIONS.join("|"),
  "i"
);

interface IOutputTransaction {
  transaction: {
    signatures: string[];
    message: {
      accountKeys: string[];
      header: {
        numRequiredSignatures: number;
        numReadonlySignedAccounts: number;
        numReadonlyUnsignedAccounts: number;
      };
      instructions: Array<{
        programIdIndex: number;
        accounts: string;
        data: string;
      }>;
      addressTableLookups?: Array<{
        accountKey: string;
        writableIndexes: string;
        readonlyIndexes: string;
      }>;
    };
  };
  meta: {
    logMessages: string[];
    innerInstructions?: Array<{
      index: number;
      instructions: Array<{
        programIdIndex: number;
        accounts: string;
        data: string;
      }>;
    }>;
  };
}

export const setupSubstream = async (server: FastifyInstance) => {
  if (!SUBSTREAM_API_KEY) throw new Error("SUBSTREAM_API_KEY undefined");
  if (!SUBSTREAM_URL) throw new Error("SUBSTREAM_URL undefined");
  if (!SUBSTREAM) throw new Error("SUBSTREAM undefined");
  const substream = await fetchSubstream(SUBSTREAM!);
  const registry = createRegistry(substream);

  let isConnecting = false;
  let currentAttemptCount = 0;
  let staleAttemptCount = 0;
  let reconnectTimeoutId: NodeJS.Timeout | null = null;
  let shouldRestart = false;
  let restartCursor: string | undefined = undefined;
  let currentAbortController: AbortController | null = null;
  let hasAttemptedCursorReset = false;

  const cursorManager = CursorManager(
    "asset_ownership",
    SUBSTREAM_CURSOR_STALENESS_THRESHOLD_MS,
    () => {
      server.customMetrics.staleCursorCounter.inc();
      staleAttemptCount++;

      if (staleAttemptCount > MAX_RECONNECT_ATTEMPTS) {
        console.error(
          `Substream failed to recover from stale cursor after ${MAX_RECONNECT_ATTEMPTS} attempts.`
        );
        process.exit(1);
      }

      if (!isConnecting && !reconnectTimeoutId) {
        handleReconnect(staleAttemptCount);
      }
    }
  );

  await Cursor.sync({ alter: true });

  const connect = async (attemptCount = 1, overrideCursor?: string, overrideStartBlock?: number) => {
    currentAttemptCount = attemptCount;

    if (currentAbortController) {
      currentAbortController.abort();
    }

    currentAbortController = new AbortController();
    const processor = await TransactionProcessor.create();

    console.log("Trees", processor.getTrees());

    applyParams(
      [
        `${MODULE}=${[...processor.getTrees()]
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
      // Fresh token on each connection to survive token expiry across reconnects
      const { token } = await authIssue(SUBSTREAM_API_KEY!);
      const transport = createGrpcTransport({
        baseUrl: SUBSTREAM_URL!,
        httpVersion: "2",
        interceptors: [createAuthInterceptor(token)],
        useBinaryFormat: true,
        jsonOptions: { typeRegistry: registry },
      });

      const cursor = overrideCursor ?? (await cursorManager.checkStaleness());
      cursorManager.startStalenessCheck();
      console.log("Connected to Substream");
      const startBlock = cursor
        ? undefined
        : overrideStartBlock ?? await provider.connection.getSlot("finalized");
      const request = createRequest({
        substreamPackage: substream,
        outputModule: MODULE,
        productionMode: PRODUCTION,
        startBlockNum: cursor ? undefined : startBlock,
        startCursor: cursor,
        finalBlocksOnly: true,
      });

      console.log(
        `Substream: Streaming from ${
          cursor ? `cursor ${cursor}` : `block ${startBlock}`
        }`
      );

      currentAttemptCount = 0;
      staleAttemptCount = 0;
      isConnecting = false;

      for await (const response of streamBlocks(transport, request)) {
        if (currentAbortController.signal.aborted) {
          await cursorManager.flushCursor();
          return;
        }

        if (shouldRestart) {
          shouldRestart = false;
          currentAbortController.abort();
          await cursorManager.flushCursor();
          return;
        }

        const message = response.message;

        if (message.case === "fatalError") {
          console.error("Substream error:", message.value);

          if (cursor && !hasAttemptedCursorReset) {
            hasAttemptedCursorReset = true;
            const existingCursor = await cursorManager.getLatestCursor();
            const blockStr = existingCursor?.getDataValue("block") as string | undefined;
            const recoveryBlock = blockStr ? parseInt(blockStr) : NaN;

            console.log(
              `Cursor incompatible with finalBlocksOnly. Resetting and restarting from ${
                isNaN(recoveryBlock) ? "latest block" : `block ${recoveryBlock}`
              }...`
            );

            await Cursor.destroy({ where: { service: "asset_ownership" } });
            cursorManager.stopStalenessCheck();
            isConnecting = false;
            await connect(1, undefined, isNaN(recoveryBlock) ? undefined : recoveryBlock);
            return;
          }

          throw new Error("Received fatal error from substream");
        }

        if (message.case === "blockScopedData") {
          staleAttemptCount = 0;
          server.customMetrics.blocksReceivedCounter.inc();

          const output = unpackMapOutput(response, registry);
          const cursor = message.value.cursor;
          // clock.number is the actual slot that produced the change;
          // finalBlockHeight is only the last finalized slot at processing time
          const block =
            message.value.clock?.number != null
              ? Number(message.value.clock.number)
              : 0;
          if (block > 0) {
            server.customMetrics.lastBlockHeightGauge.set(block);
          }

          const hasTransactions =
            output !== undefined &&
            !isEmptyMessage(output) &&
            (output as any).transactions.length > 0;

          let hasFilteredTransactions = false;

          if (hasTransactions) {
            const outputTransactions = (output as any)
              .transactions as IOutputTransaction[];

            const filteredTransactions = outputTransactions.filter((tx) =>
              tx.meta.logMessages.some((log) =>
                RELEVANT_INSTRUCTIONS_REGEX.test(log)
              )
            );

            if (filteredTransactions.length > 0) {
              hasFilteredTransactions = true;

              const dbTx = await database.transaction();

              try {
                for (const transactionInfo of filteredTransactions) {
                  const converted = await convertSubstreamTransaction(
                    transactionInfo
                  );
                  if (!converted) {
                    console.warn(
                      `Failed to convert substream transaction in block ${block}`,
                      {
                        logMessages:
                          transactionInfo.meta?.logMessages?.slice(0, 5),
                      }
                    );
                    server.customMetrics.conversionFailureCounter.inc();
                    continue;
                  }

                  const { accountKeys, instructions } = converted;

                  const { updatedTrees } =
                    await processor.processTransaction(
                      {
                        accountKeys,
                        instructions,
                        innerInstructions:
                          transactionInfo.meta.innerInstructions?.map(
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (inner: any) => ({
                              index: inner.index,
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              instructions: inner.instructions.map(
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                (ix: any) => ({
                                  programIdIndex: ix.programIdIndex,
                                  accountKeyIndexes: Buffer.from(
                                    ix.accounts,
                                    "base64"
                                  ).toJSON().data,
                                  data: Buffer.from(ix.data, "base64"),
                                })
                              ),
                            })
                          ),
                      },
                      dbTx,
                      block
                    );

                  if (updatedTrees) {
                    console.log("Trees updated");
                    shouldRestart = true;
                    restartCursor = cursor;
                    await cursorManager.updateCursor({
                      cursor,
                      block: block?.toString() || "unknown",
                      force: true,
                    });
                  }
                }

                await dbTx.commit();
                server.customMetrics.blocksProcessedCounter.inc();
              } catch (err) {
                await dbTx.rollback();
                server.customMetrics.transactionFailureCounter.inc();
                console.error(
                  `Failed to process block ${block}, rolled back:`,
                  err
                );
              }
            }
          }

          await cursorManager.updateCursor({
            cursor,
            block: block?.toString() || "unknown",
            force: hasFilteredTransactions,
          });
        }
      }

      if (shouldRestart) {
        shouldRestart = false;
        await connect(1, restartCursor);
      } else {
        // Stream ended normally (server closed gracefully), reconnect
        cursorManager.stopStalenessCheck();
        await cursorManager.flushCursor();
        isConnecting = false;
        handleReconnect(1);
      }
    } catch (err) {
      cursorManager.stopStalenessCheck();
      try {
        await cursorManager.flushCursor();
      } catch (flushErr) {
        console.error("Failed to flush cursor during reconnect:", flushErr);
      }
      console.log("Substream connection error:", err);
      isConnecting = false;

      const isCursorIncompat =
        err instanceof Error &&
        err.message.includes("invalid_argument");

      if (isCursorIncompat && !hasAttemptedCursorReset) {
        hasAttemptedCursorReset = true;
        const existingCursor = await cursorManager.getLatestCursor();
        const blockStr = existingCursor?.getDataValue("block") as
          | string
          | undefined;
        const recoveryBlock = blockStr ? parseInt(blockStr) : NaN;

        console.log(
          `Cursor incompatible with finalBlocksOnly. Resetting and restarting from ${
            isNaN(recoveryBlock) ? "latest block" : `block ${recoveryBlock}`
          }...`
        );

        await Cursor.destroy({ where: { service: "asset_ownership" } });
        await connect(1, undefined, isNaN(recoveryBlock) ? undefined : recoveryBlock);
        return;
      }

      handleReconnect(currentAttemptCount + 1);
    }
  };

  const handleReconnect = async (
    nextAttempt: number = currentAttemptCount + 1
  ) => {
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
    }

    const baseDelay = 1000;
    const delay =
      nextAttempt === 1 ? 0 : baseDelay * Math.pow(2, nextAttempt - 1);

    reconnectTimeoutId = setTimeout(() => {
      reconnectTimeoutId = null;
      console.log(
        `Attempting to reconnect (attempt ${nextAttempt} of ${MAX_RECONNECT_ATTEMPTS})...`
      );
      connect(nextAttempt).catch((err) => {
        console.error("Reconnect failed:", err);
        process.exit(1);
      });
    }, delay);
  };

  await connect();
};
