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
import { Op } from "sequelize";
import {
  PRODUCTION,
  SUBSTREAM,
  SUBSTREAM_API_KEY,
  SUBSTREAM_URL,
  SUBSTREAM_CURSOR_STALENESS_THRESHOLD_MS,
} from "../env";
import { getPluginsByAccountTypeByProgram } from "../plugins";
import { IConfig } from "../types";
import { Cursor, database } from "../utils/database";
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

export const CursorManager = (stalenessThreshold: number) => {
  let checkInterval: NodeJS.Timeout | undefined;

  const formatStaleness = (staleness: number): string => {
    const stalenessInHours = staleness / 3600000;
    return stalenessInHours >= 1
      ? `${stalenessInHours.toFixed(1)}h`
      : `${(staleness / 60000).toFixed(1)}m`;
  };

  const getLatestCursor = async (): Promise<Cursor | null> =>
    await Cursor.findOne({ order: [["createdAt", "DESC"]] });

  const updateCursor = async (cursor: string): Promise<void> => {
    await database.transaction(async (t) => {
      await Cursor.upsert({ cursor }, { transaction: t });
      await Cursor.destroy({
        where: {
          cursor: { [Op.ne]: cursor },
        },
        transaction: t,
      });
    });
  };

  const checkStaleness = async (
    onStale?: () => void
  ): Promise<string | undefined> => {
    const cursor = await getLatestCursor();
    if (!cursor) return undefined;

    const staleness =
      Date.now() - new Date(cursor.dataValues.createdAt).getTime();
    if (staleness >= stalenessThreshold) {
      console.log(
        `Cursor is stale (${formatStaleness(
          staleness
        )} old), connecting from current block`
      );
      onStale && onStale();
      return undefined;
    }

    return cursor.cursor;
  };

  const startStalenessCheck = (onStale: () => void): void => {
    if (checkInterval) clearInterval(checkInterval);
    checkInterval = setInterval(() => checkStaleness(onStale), 30_000);
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
  };
};

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
  const cursorManager = CursorManager(SUBSTREAM_CURSOR_STALENESS_THRESHOLD_MS);
  const pluginsByAccountTypeByProgram = await getPluginsByAccountTypeByProgram(
    configs
  );

  const connect = async (attemptCount = 0) => {
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

      cursorManager.startStalenessCheck(() => {
        handleReconnect(0);
      });

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
        const message = response.message;

        if (message.case === "fatalError") {
          console.error("Substream error:", message.value);
          throw new Error("Received fatal error from substream");
        }

        if (message.case === "blockScopedData") {
          try {
            const output = unpackMapOutput(response, registry);
            const cursor = message.value.cursor;
            if (output !== undefined && !isEmptyMessage(output)) {
              const accountPromises = (output as any).accounts
                .map(async (account: IOutputAccount) => {
                  const { owner, address, data, deleted } = account;
                  const ownerKey = new PublicKey(owner);
                  const addressKey = new PublicKey(address);
                  const config = configs.find(
                    (x) => x.programId === ownerKey.toBase58()
                  );

                  if (!config) return null;

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
                      pluginsByAccountTypeByProgram[ownerKey.toBase58()] || {},
                  });
                })
                .filter(Boolean);

              await Promise.all(accountPromises);
              await cursorManager.updateCursor(cursor);
            }
          } catch (err) {
            console.error("Substream error:", err);
            throw err;
          }
        }
      }
    } catch (err) {
      cursorManager.stopStalenessCheck();
      console.log("Substream connection error:", err);
      isConnecting = false;
      handleReconnect(attemptCount + 1);
    }
  };

  const handleReconnect = async (nextAttempt: number) => {
    console.log(
      `Attempting to reconnect (attempt ${nextAttempt} of ${MAX_RECONNECT_ATTEMPTS})...`
    );

    const delay = nextAttempt === 1 ? 0 : 1000;
    setTimeout(() => connect(nextAttempt), delay);
  };

  await connect();
};
