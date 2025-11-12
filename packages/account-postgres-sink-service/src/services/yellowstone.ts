import { PublicKey } from "@solana/web3.js";
import Client, {
  CommitmentLevel,
  SubscribeRequest,
  SubscribeUpdate,
  SubscribeUpdateAccount,
} from "@triton-one/yellowstone-grpc";
import { FastifyInstance } from "fastify";
import { YELLOWSTONE_TOKEN, YELLOWSTONE_URL } from "../env";
import { getPluginsByAccountTypeByProgram } from "../plugins";
import { IConfig } from "../types";
import { convertYellowstoneTransaction } from "../utils/convertYellowstoneTransaction";
import { handleAccountWebhook } from "../utils/handleAccountWebhook";
import { handleTransactionWebhook } from "../utils/handleTransactionWebhook";

const MAX_RECONNECT_ATTEMPTS = 5;
export const setupYellowstone = async (
  server: FastifyInstance,
  configs: IConfig[]
) => {
  if (!YELLOWSTONE_TOKEN) {
    throw new Error("YELLOWSTONE_TOKEN undefined");
  }

  let isReconnecting = false;
  const pluginsByAccountTypeByProgram = await getPluginsByAccountTypeByProgram(
    configs
  );

  const connect = async (attemptCount = 0) => {
    if (attemptCount >= MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `Yellowstone failed to connect after ${MAX_RECONNECT_ATTEMPTS} attempts.`
      );
      process.exit(1);
    }

    const client = new Client(YELLOWSTONE_URL, YELLOWSTONE_TOKEN, {
      "grpc.max_receive_message_length": 2065853043,
      "grpc.keepalive_time_ms": 10000,
      "grpc.keepalive_timeout_ms": 5000,
      "grpc.keepalive_permit_without_calls": 1,
    });

    try {
      const stream = await client.subscribe();
      console.log("Connected to Yellowstone");
      attemptCount = 0;
      isReconnecting = false;

      stream.on("data", async (data: SubscribeUpdate) => {
        try {
          if (data.transaction) {
            const transaction = await convertYellowstoneTransaction(
              data.transaction.transaction
            );

            if (transaction) {
              try {
                await handleTransactionWebhook({
                  fastify: server,
                  configs,
                  transaction,
                });
              } catch (err) {
                console.error(err);
              }
            }
          }

          if (data.account) {
            const account = (data.account as SubscribeUpdateAccount)?.account;
            if (account && configs) {
              const owner = new PublicKey(account.owner).toBase58();
              const config = configs.find((x) => x.programId === owner);

              if (config) {
                try {
                  await handleAccountWebhook({
                    fastify: server,
                    programId: new PublicKey(config.programId),
                    accounts: config.accounts,
                    account: {
                      ...account,
                      pubkey: new PublicKey(account.pubkey).toBase58(),
                      data: [account.data],
                    },
                    pluginsByAccountType:
                      pluginsByAccountTypeByProgram[owner] || {},
                    block: undefined,
                  });
                } catch (err) {
                  console.error(err);
                }
              }
            }
          }
        } catch (err) {
          console.error("Yellowstone: Error processing data:", err);
        }
      });

      const request: SubscribeRequest = {
        accounts: {
          client: {
            owner: configs.map((c) => c.programId),
            account: [],
            filters: [],
          },
        },
        slots: {},
        transactions: {
          client: {
            vote: false,
            failed: false,
            accountInclude: configs.map((c) => c.programId),
            accountExclude: [],
            accountRequired: [],
          },
        },
        entry: {},
        blocks: {},
        blocksMeta: {},
        accountsDataSlice: [],
        ping: undefined,
        commitment: CommitmentLevel.CONFIRMED,
      };

      stream.write(request, (err: any) => {
        if (err) {
          console.error(`Failed to write initial request: ${err}`);
          stream.end();
        }
      });

      stream.on("error", (err) => {
        console.error("Yellowstone stream error:", err);
        stream.end();
      });

      stream.on("end", () => {
        console.log("Yellowstone stream ended");
        if (!isReconnecting) {
          isReconnecting = true;
          handleReconnect(attemptCount + 1);
        }
      });

      stream.on("close", () => {
        console.log("Yellowstone stream closed");
        if (!isReconnecting) {
          isReconnecting = true;
          handleReconnect(attemptCount + 1);
        }
      });
    } catch (err) {
      console.log("Yellowstone connection error:", err);
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
