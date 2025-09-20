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
  const { token } = await authIssue(SUBSTREAM_API_KEY!);
  const substream = await fetchSubstream(SUBSTREAM!);
  const registry = createRegistry(substream);
  const transport = createGrpcTransport({
    baseUrl: SUBSTREAM_URL!,
    httpVersion: "2",
    interceptors: [createAuthInterceptor(token)],
    useBinaryFormat: true,
    jsonOptions: { typeRegistry: registry },
  });

  let isConnecting = false;
  let currentAttemptCount = 0;
  let staleAttemptCount = 0;
  let reconnectTimeoutId: NodeJS.Timeout | null = null;
  let shouldRestart = false;
  let restartCursor: string | undefined = undefined;
  let currentAbortController: AbortController | null = null;

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

  const connect = async (attemptCount = 1, overrideCursor?: string) => {
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
      await Cursor.sync({ alter: true });
      const cursor = overrideCursor ?? (await cursorManager.checkStaleness());
      cursorManager.startStalenessCheck();
      console.log("Connected to Substream");
      const startBlock = await provider.connection.getSlot("finalized");
      const request = createRequest({
        substreamPackage: substream,
        outputModule: MODULE,
        productionMode: PRODUCTION,
        startBlockNum: cursor ? undefined : startBlock,
        startCursor: cursor,
      });

      console.log(
        `Substream: Streaming from ${
          cursor ? `cursor ${cursor}` : `block ${startBlock}`
        }`
      );

      currentAttemptCount = 0;
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
          staleAttemptCount = 0;

          const output = unpackMapOutput(response, registry);
          const cursor = message.value.cursor;
          const block = message.value.finalBlockHeight
            ? Number(message.value.finalBlockHeight)
            : null;

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
                await Promise.all(
                  filteredTransactions.map(async (transactionInfo) => {
                    const converted = await convertSubstreamTransaction(
                      transactionInfo
                    );
                    if (!converted) return;

                    const { tx, addressLookupTableAccounts } = converted;
                    const { message } = tx;
                    const { staticAccountKeys, accountKeysFromLookups } =
                      message.getAccountKeys({
                        addressLookupTableAccounts,
                      });

                    const accountKeys = [
                      ...staticAccountKeys,
                      ...(accountKeysFromLookups?.writable || []),
                      ...(accountKeysFromLookups?.readonly || []),
                    ];

                    const { updatedTrees } = await processor.processTransaction(
                      {
                        accountKeys,
                        instructions: message.compiledInstructions,
                        innerInstructions:
                          transactionInfo.meta.innerInstructions?.map(
                            (inner) => ({
                              index: inner.index,
                              instructions: inner.instructions.map((ix) => ({
                                programIdIndex: ix.programIdIndex,
                                accountKeyIndexes: Buffer.from(
                                  ix.accounts,
                                  "base64"
                                ).toJSON().data,
                                data: Buffer.from(ix.data, "base64"),
                              })),
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
                  })
                );

                await dbTx.commit();
              } catch (err) {
                await dbTx.rollback();
                throw err;
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
      }
    } catch (err) {
      cursorManager.stopStalenessCheck();
      console.log("Substream connection error:", err);
      isConnecting = false;
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
      connect(nextAttempt);
    }, delay);
  };

  await connect();
};
