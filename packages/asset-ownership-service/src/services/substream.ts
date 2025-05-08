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
import { Op, QueryTypes } from "sequelize";
import {
  PG_MAKER_TABLE,
  PRODUCTION,
  SUBSTREAM,
  SUBSTREAM_API_KEY,
  SUBSTREAM_CURSOR_STALENESS_THRESHOLD_MS,
  SUBSTREAM_URL,
} from "../env";
import { Cursor, database } from "../utils/database";
import { provider } from "../utils/solana";
import { PROGRAM_ID } from "@metaplex-foundation/mpl-bubblegum";

const MODULE = "transactions_by_programid_and_account_without_votes";
const MAX_RECONNECT_ATTEMPTS = 5;
const RELEVENT_INSTRUCTIONS = [
  "IssueEntityV0",
  "Transfer",
  "UpdateMakerTreeV0",
];

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
  stalenessThreshold: number,
  onStale?: () => void
) => {
  const CURSOR_UPDATE_INTERVAL = 30_000;
  let checkInterval: NodeJS.Timeout | undefined;
  let lastReceivedBlock: number = Date.now();
  let pendingCursor: { cursor: string; blockHeight: string } | null = null;
  let lastCursorUpdate = 0;

  const formatStaleness = (staleness: number): string => {
    const stalenessInHours = staleness / 3600000;
    return stalenessInHours >= 1
      ? `${stalenessInHours.toFixed(1)}h`
      : `${(staleness / 60000).toFixed(1)}m`;
  };

  const getLatestCursor = async (): Promise<Cursor | null> =>
    await Cursor.findOne({ order: [["createdAt", "DESC"]] });

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
    pendingCursor = { cursor, blockHeight };

    if (force || now - lastCursorUpdate >= CURSOR_UPDATE_INTERVAL) {
      if (pendingCursor) {
        await database.transaction(async (t) => {
          await Cursor.upsert(pendingCursor!, { transaction: t });
          await Cursor.destroy({
            where: {
              cursor: { [Op.ne]: pendingCursor!.cursor },
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
  const substream = await fetchSubstream(SUBSTREAM!);
  const registry = createRegistry(substream);
  const transport = createGrpcTransport({
    baseUrl: SUBSTREAM_URL!,
    httpVersion: "2",
    interceptors: [createAuthInterceptor(token)],
    useBinaryFormat: true,
    jsonOptions: { typeRegistry: registry },
  });

  const merkleTrees: string[] = (
    (await database.query(`SELECT merkle_tree FROM ${PG_MAKER_TABLE};`, {
      type: QueryTypes.SELECT,
    })) as { merkle_tree: string }[]
  ).map((row) => row.merkle_tree);

  applyParams(
    [
      `${MODULE}=${merkleTrees
        .map((merkleTree) => `program:${PROGRAM_ID} && account:${merkleTree}`)
        .join(" || ")}`,
    ],
    substream.modules!.modules
  );

  let isConnecting = false;
  const cursorManager = CursorManager(
    SUBSTREAM_CURSOR_STALENESS_THRESHOLD_MS,
    () => console.log("stale")
  );

  const connect = async (attemptCount = 1) => {
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

      attemptCount = 0;
      isConnecting = false;

      for await (const response of streamBlocks(transport, request)) {
        const message = response.message;

        if (message.case === "fatalError") {
          console.error("Substream error:", message.value);
          throw new Error("Received fatal error from substream");
        }

        if (message.case === "blockScopedData") {
          const output = unpackMapOutput(response, registry);
          const cursor = message.value.cursor;
          const hasTransactions =
            output !== undefined &&
            !isEmptyMessage(output) &&
            (output as any).transactions.length > 0;
          const blockHeight =
            message.value.finalBlockHeight?.toString() || "unknown";

          if (hasTransactions) {
            const outputTransactions = (output as any)
              .transactions as IOutputTransaction[];

            const filteredTransactions = outputTransactions.filter((tx) =>
              tx.meta.logMessages.some((log) =>
                RELEVENT_INSTRUCTIONS.some((instr) => log.includes(instr))
              )
            );

            if (filteredTransactions.length > 0) {
              console.log(
                "Relevant transactions:",
                JSON.stringify(filteredTransactions, null, 2)
              );

              //   const accountPromises = (output as any).accounts
              //     .map(async (account: IOutputAccount) => {
              //       const { owner, address, data, deleted } = account;
              //       const ownerKey = new PublicKey(owner);
              //       const addressKey = new PublicKey(address);
              //       const config = configs.find(
              //         (x) => x.programId === ownerKey.toBase58()
              //       );

              //       if (!config) return null;
              //       return handleAccountWebhook({
              //         fastify: server,
              //         programId: ownerKey,
              //         accounts: config.accounts,
              //         account: {
              //           pubkey: addressKey.toBase58(),
              //           data: [data, undefined],
              //         },
              //         isDelete: deleted,
              //         pluginsByAccountType:
              //           pluginsByAccountTypeByProgram[ownerKey.toBase58()] || {},
              //       });
              //     })
              //     .filter(Boolean);

              //   await Promise.all(accountPromises);
            }
          }

          await cursorManager.updateCursor({
            cursor,
            blockHeight,
          });
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
