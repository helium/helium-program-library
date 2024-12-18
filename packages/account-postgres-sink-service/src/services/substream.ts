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
  SUBSTREAM_CURSOR_MAX_AGE_DAYS,
} from "../env";
import { getPluginsByAccountTypeByProgram } from "../plugins";
import { IConfig } from "../types";
import { Cursor, database } from "../utils/database";
import { handleAccountWebhook } from "../utils/handleAccountWebhook";
import { provider } from "../utils/solana";

const MODULE = "filtered_accounts";
const MAX_RECONNECT_ATTEMPTS = 5;

interface IOuputAccount {
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

  let isReconnecting = false;
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

    await Cursor.sync({ alter: true });
    const lastCursor = await Cursor.findOne({ order: [["createdAt", "DESC"]] });
    let cursor: string | undefined;

    try {
      console.log("Connected to Substream");
      if (lastCursor) {
        const cursorDate = new Date(lastCursor.dataValues.createdAt);
        const cursorAge =
          (Date.now() - cursorDate.getTime()) / (24 * 60 * 60 * 1000);

        if (cursorAge > SUBSTREAM_CURSOR_MAX_AGE_DAYS) {
          console.log(
            `Cursor is ${Math.floor(
              cursorAge
            )} days old, starting from current block`
          );
          cursor = undefined;
        } else {
          cursor = lastCursor.cursor;
          console.log(
            `Using existing cursor from ${Math.floor(cursorAge)} days ago`
          );
        }
      } else {
        cursor = undefined;
        console.log("No existing cursor found, starting from current block");
      }

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
      isReconnecting = false;

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
                .map(async (account: IOuputAccount) => {
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
              await database.transaction(async (t) => {
                await Cursor.upsert({ cursor }, { transaction: t });
                await Cursor.destroy({
                  where: {
                    cursor: {
                      [Op.ne]: cursor,
                    },
                  },
                  transaction: t,
                });
              });
            }
          } catch (err) {
            console.error("Substream error:", err);
            throw err;
          }
        }
      }
    } catch (err) {
      console.log("Substream connection error:", err);
      if (!isReconnecting) {
        isReconnecting = true;
        handleReconnect(attemptCount + 1);
      }
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
