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
import { CursorManager } from "../utils/cursor";
import { Cursor } from "../utils/database";
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
  configs: IConfig[]
) => {
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

  applyParams(
    [
      `${MODULE}=${configs
        .map((config) => `owner:${config.programId}`)
        .join(" || ")}`,
    ],
    substream.modules!.modules
  );

  let isConnecting = false;
  let currentAttemptCount = 0;
  let staleAttemptCount = 0;
  let reconnectTimeoutId: NodeJS.Timeout | null = null;

  const cursorManager = CursorManager(
    "account_sink",
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
  const pluginsByAccountTypeByProgram = await getPluginsByAccountTypeByProgram(
    configs
  );

  const connect = async (attemptCount = 1) => {
    currentAttemptCount = attemptCount;

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
      const cursor = await cursorManager.checkStaleness();
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

      currentAttemptCount = 0;
      isConnecting = false;

      for await (const response of streamBlocks(transport, request)) {
        const message = response.message;

        if (message.case === "fatalError") {
          console.error("Substream error:", message.value);
          throw new Error("Received fatal error from substream");
        }

        if (message.case === "blockScopedData") {
          staleAttemptCount = 0;

          const output = unpackMapOutput(response, registry);
          const cursor = message.value.cursor;
          const blockHeight =
            message.value.finalBlockHeight?.toString() || "unknown";

          const hasAccountChanges =
            output !== undefined &&
            !isEmptyMessage(output) &&
            (output as any).accounts.length > 0;

          if (hasAccountChanges) {
            // Group accounts by owner
            const accountsByOwner = (output as any).accounts.reduce((acc: { [key: string]: IOutputAccount[] }, account: IOutputAccount) => {
              const ownerKey = new PublicKey(account.owner).toBase58();
              if (!acc[ownerKey]) {
                acc[ownerKey] = [];
              }
              acc[ownerKey].push(account);
              return acc;
            }, {});

            // Process each owner's accounts sequentially, but accounts within an owner in parallel
            // This prevents race conditions in plugins that rely on bidirectional relationships
            for (const [ownerStr, accounts] of Object.entries(accountsByOwner) as [string, IOutputAccount[]][]) {
              const ownerKey = new PublicKey(ownerStr);
              const config = configs.find(
                (x) => x.programId === ownerStr
              );

              if (!config) continue;

              const accountPromises = accounts.map(async (account: IOutputAccount) => {
                const { address, data, deleted } = account;
                const addressKey = new PublicKey(address);
                
                return handleAccountWebhook({
                  fastify: server,
                  programId: ownerKey,
                  accounts: config.accounts,
                  account: {
                    pubkey: addressKey.toBase58(),
                    data: [data, undefined],
                  },
                  isDelete: deleted,
                  pluginsByAccountType:
                    pluginsByAccountTypeByProgram[ownerStr] || {},
                });
              });

              await Promise.all(accountPromises);
            }
          }

          await cursorManager.updateCursor({
            cursor,
            blockHeight,
            force: hasAccountChanges,
          });
        }
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
