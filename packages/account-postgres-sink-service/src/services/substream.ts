import { PublicKey } from "@solana/web3.js";
import { FastifyInstance } from "fastify";
import { SUBSTREAM_API_KEY, SUBSTREAM, SUBSTREAM_URL } from "../env";
import { IConfig } from "../types";
import { getPluginsByAccountTypeByProgram } from "../plugins";
import { Cursor } from "../utils/database";
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
import { createGrpcTransport } from "@connectrpc/connect-node";
import { provider } from "../utils/solana";

const MODULE = "filtered_accounts";
const MAX_RECONNECT_ATTEMPTS = 5;

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
        .map((config, idx) => `accounts[${idx}]=${config.programId}`)
        .join("&")}`,
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
    const lastCursor = await Cursor.findOne({ order: ["createdAt", "DESC"] });

    try {
      let cursor = lastCursor?.cursor;
      const currentBlock = await provider.connection.getSlot("finalized");
      const request = createRequest({
        substreamPackage: substream,
        outputModule: MODULE,
        startBlockNum: cursor ? undefined : currentBlock,
        startCursor: cursor,
        productionMode: true,
      });

      console.log(
        `Substream: Streaming from ${
          lastCursor ? `cursor ${lastCursor.cursor}` : `block ${currentBlock}`
        }`
      );

      for await (const response of streamBlocks(transport, request)) {
        const output = unpackMapOutput(response, registry);
        if (response.message.case === "blockScopedData") {
          cursor = response.message.value.cursor;
        }

        if (output !== undefined && !isEmptyMessage(output)) {
          // Re attempt insertion if possible.
          console.log(output);
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
