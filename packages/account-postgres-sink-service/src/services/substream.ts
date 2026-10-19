import { createGrpcTransport } from "@connectrpc/connect-node";
import { PublicKey } from "@solana/web3.js";
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
import {
  PRODUCTION,
  SUBSTREAM,
  SUBSTREAM_API_KEY,
  SUBSTREAM_CURSOR_STALENESS_THRESHOLD_MS,
  SUBSTREAM_URL,
} from "../env";
import { getPluginsByAccountTypeByProgram } from "../plugins";
import { IConfig } from "../types";
import { Transaction } from "sequelize";
import { CursorManager } from "../utils/cursor";
import database, { Cursor } from "../utils/database";
import { handleAccountWebhook } from "../utils/handleAccountWebhook";
import { provider } from "../utils/solana";

const MODULE = "filtered_accounts";
const MAX_RECONNECT_ATTEMPTS = 5;

interface IOutputAccount {
  owner: Buffer;
  address: Buffer;
  data: Buffer;
  deleted: boolean;
}

export const setupSubstream = async (
  server: FastifyInstance,
  configs: IConfig[],
) => {
  if (!SUBSTREAM_API_KEY) throw new Error("SUBSTREAM_API_KEY undefined");
  if (!SUBSTREAM_URL) throw new Error("SUBSTREAM_URL undefined");
  if (!SUBSTREAM) throw new Error("SUBSTREAM undefined");

  const substream = await fetchSubstream(SUBSTREAM!);
  const registry = createRegistry(substream);

  applyParams(
    [
      `${MODULE}=${configs
        .map((config) => `owner:${config.programId}`)
        .join(" || ")}`,
    ],
    substream.modules!.modules,
  );

  let isConnecting = false;
  let currentAttemptCount = 0;
  let staleAttemptCount = 0;
  let reconnectTimeoutId: NodeJS.Timeout | null = null;
  let gcIntervalId: NodeJS.Timeout | undefined;
  let hasAttemptedCursorReset = false;
  let activeStream: AbortController | null = null;
  // Block a cursor reset restarts from. Any connect that finds no cursor uses
  // it until a cursor is written, so a reconnect racing the reset cannot skip
  // ahead to the latest slot.
  let pendingRecoveryBlock: number | undefined;

  const cursorManager = CursorManager(
    "account_sink",
    SUBSTREAM_CURSOR_STALENESS_THRESHOLD_MS,
    () => {
      server.customMetrics.staleCursorCounter.inc();
      staleAttemptCount++;

      if (staleAttemptCount > MAX_RECONNECT_ATTEMPTS) {
        console.error(
          `Substream failed to recover from stale cursor after ${MAX_RECONNECT_ATTEMPTS} attempts.`,
        );
        process.exit(1);
      }

      if (!isConnecting && !reconnectTimeoutId) {
        handleReconnect(staleAttemptCount);
      }
    },
  );
  const pluginsByAccountTypeByProgram =
    await getPluginsByAccountTypeByProgram(configs);

  await Cursor.sync({ alter: true });

  const RECONNECT_DELAY_MS = 5_000;

  // Keeps at most one pending reconnect timer.
  const scheduleConnect = (
    delay: number,
    attempt: number,
    startBlock?: number,
  ) => {
    if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = setTimeout(() => {
      reconnectTimeoutId = null;
      connect(attempt, startBlock).catch((err) => {
        console.error("Reconnect failed:", err);
        process.exit(1);
      });
    }, delay);
  };

  const connect = async (attemptCount = 1, overrideStartBlock?: number) => {
    currentAttemptCount = attemptCount;

    if (attemptCount >= MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `Substream failed to connect after ${MAX_RECONNECT_ATTEMPTS} attempts.`,
      );
      process.exit(1);
    }

    if (isConnecting) return;
    isConnecting = true;

    // A stale-cursor reconnect can start while the previous stream is still
    // open. Abort it; the old loop checks the signal before each write so
    // only one loop writes accounts and cursors.
    activeStream?.abort();
    const stream = new AbortController();
    activeStream = stream;

    try {
      // Fresh token on each connection to survive token expiry across reconnects
      const { token } = await authIssue(SUBSTREAM_API_KEY!);
      if (gcIntervalId) {
        clearInterval(gcIntervalId);
        gcIntervalId = undefined;
      }

      const transport = createGrpcTransport({
        baseUrl: SUBSTREAM_URL!,
        httpVersion: "2",
        interceptors: [createAuthInterceptor(token)],
        useBinaryFormat: true,
        jsonOptions: { typeRegistry: registry },
      });

      if (global.gc) {
        gcIntervalId = setInterval(() => {
          global.gc!();
        }, 300_000);
        gcIntervalId.unref();
      }

      const cursor = await cursorManager.checkStaleness();
      cursorManager.startStalenessCheck();
      console.log("Connected to Substream");
      const startBlock = cursor
        ? undefined
        : (overrideStartBlock ??
          pendingRecoveryBlock ??
          (await provider.connection.getSlot("finalized")));
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
        }`,
      );

      isConnecting = false;
      let hasReceivedBlock = false;

      for await (const response of streamBlocks(transport, request, {
        signal: stream.signal,
      })) {
        if (stream.signal.aborted) return;
        const message = response.message;

        if (message.case === "fatalError") {
          console.error("Substream error:", message.value);

          if (cursor && !hasAttemptedCursorReset) {
            hasAttemptedCursorReset = true;
            const existingCursor = await cursorManager.getLatestCursor();
            if (stream.signal.aborted) return;
            const blockStr = existingCursor?.getDataValue("block") as
              | string
              | undefined;
            const recoveryBlock = blockStr ? parseInt(blockStr) : NaN;

            console.log(
              `Cursor incompatible with finalBlocksOnly. Resetting and restarting from ${
                isNaN(recoveryBlock) ? "latest block" : `block ${recoveryBlock}`
              }...`,
            );

            const recoveryStartBlock = isNaN(recoveryBlock)
              ? undefined
              : recoveryBlock;
            pendingRecoveryBlock = recoveryStartBlock;
            await Cursor.destroy({ where: { service: "account_sink" } });
            if (stream.signal.aborted) return;
            cursorManager.stopStalenessCheck();
            isConnecting = false;
            console.log(
              `Waiting ${RECONNECT_DELAY_MS / 1000}s before planned reconnect...`,
            );
            scheduleConnect(RECONNECT_DELAY_MS, 1, recoveryStartBlock);
            return;
          }

          throw new Error("Received fatal error from substream");
        }

        if (message.case === "blockScopedData") {
          if (!hasReceivedBlock) {
            hasReceivedBlock = true;
            currentAttemptCount = 0;
          }
          staleAttemptCount = 0;
          server.customMetrics.blocksReceivedCounter.inc();

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let output: any = unpackMapOutput(response, registry);
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

          const hasAccountChanges =
            output !== undefined &&
            !isEmptyMessage(output) &&
            (output as any).accounts.length > 0;

          if (hasAccountChanges) {
            // eslint-disable-next-line prefer-const
            let accounts = (output as any).accounts as IOutputAccount[];
            output = null;

            const t = await database.transaction({
              isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
            });

            try {
              const configsByOwner = new Map<string, IConfig>();
              for (const account of accounts) {
                const ownerStr = new PublicKey(account.owner).toBase58();
                if (!configsByOwner.has(ownerStr)) {
                  const config = configs.find((x) => x.programId === ownerStr);
                  if (config) configsByOwner.set(ownerStr, config);
                }
              }

              for (const account of accounts) {
                const ownerStr = new PublicKey(account.owner).toBase58();
                const config = configsByOwner.get(ownerStr);
                if (!config) continue;

                const { address, data, deleted } = account;
                const addressKey = new PublicKey(address);

                await handleAccountWebhook({
                  fastify: server,
                  programId: new PublicKey(ownerStr),
                  accounts: config.accounts,
                  account: {
                    pubkey: addressKey.toBase58(),
                    data: [data, undefined],
                  },
                  isDelete: deleted,
                  pluginsByAccountType:
                    pluginsByAccountTypeByProgram[ownerStr] || {},
                  block,
                  transaction: t,
                });
              }

              // An abort after this check can still commit, but the
              // transaction already holds the row locks from its upserts, so
              // the newer stream's writes to those rows wait and win.
              if (stream.signal.aborted) {
                await t.rollback();
                return;
              }
              await t.commit();
            } catch (err) {
              await t.rollback();
              throw err;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            accounts = null as any;
          } else {
            output = null;
          }

          if (hasAccountChanges && global.gc) {
            global.gc();
          }

          if (stream.signal.aborted) return;
          // Force the first write after a reset so the recovery block can
          // be cleared once a cursor is persisted.
          await cursorManager.updateCursor({
            cursor,
            block: block?.toString() || "unknown",
            force: hasAccountChanges || pendingRecoveryBlock !== undefined,
          });
          pendingRecoveryBlock = undefined;
        }
      }

      if (stream.signal.aborted) return;

      // Stream ended normally (server closed gracefully), reconnect
      cursorManager.stopStalenessCheck();
      if (gcIntervalId) {
        clearInterval(gcIntervalId);
        gcIntervalId = undefined;
      }
      await cursorManager.flushCursor();
      isConnecting = false;
      handleReconnect(1);
    } catch (err) {
      // A newer connection replaced this one and owns the shared state.
      if (stream.signal.aborted) return;

      cursorManager.stopStalenessCheck();
      if (gcIntervalId) {
        clearInterval(gcIntervalId);
        gcIntervalId = undefined;
      }
      await cursorManager.flushCursor();
      if (stream.signal.aborted) return;
      console.log("Substream connection error:", err);
      isConnecting = false;

      const isCursorIncompat =
        err instanceof Error && err.message.includes("invalid_argument");

      if (isCursorIncompat && !hasAttemptedCursorReset) {
        hasAttemptedCursorReset = true;
        const existingCursor = await cursorManager.getLatestCursor();
        if (stream.signal.aborted) return;
        const blockStr = existingCursor?.getDataValue("block") as
          | string
          | undefined;
        const recoveryBlock = blockStr ? parseInt(blockStr) : NaN;

        console.log(
          `Cursor incompatible with finalBlocksOnly. Resetting and restarting from ${
            isNaN(recoveryBlock) ? "latest block" : `block ${recoveryBlock}`
          }...`,
        );

        const recoveryStartBlock = isNaN(recoveryBlock)
          ? undefined
          : recoveryBlock;
        pendingRecoveryBlock = recoveryStartBlock;
        await Cursor.destroy({ where: { service: "account_sink" } });
        if (stream.signal.aborted) return;
        console.log(
          `Waiting ${RECONNECT_DELAY_MS / 1000}s before planned reconnect...`,
        );
        scheduleConnect(RECONNECT_DELAY_MS, 1, recoveryStartBlock);
        return;
      }

      const isResourceExhausted =
        err instanceof Error && err.message.includes("resource_exhausted");

      if (isResourceExhausted) {
        const exhaustedDelay = 15_000 + Math.random() * 5_000;
        console.log(
          `Resource exhausted, waiting ${Math.round(
            exhaustedDelay / 1000,
          )}s before reconnect...`,
        );
        scheduleConnect(exhaustedDelay, currentAttemptCount + 1);
        return;
      }

      handleReconnect(currentAttemptCount + 1);
    }
  };

  const handleReconnect = async (
    nextAttempt: number = currentAttemptCount + 1,
  ) => {
    const baseDelay = 1000;
    const MIN_DELAY = 2000;
    const delay = Math.max(MIN_DELAY, baseDelay * Math.pow(2, nextAttempt - 1));

    console.log(
      `Reconnecting in ${delay / 1000}s (attempt ${nextAttempt} of ${MAX_RECONNECT_ATTEMPTS})...`,
    );
    scheduleConnect(delay, nextAttempt);
  };

  await connect();
};
