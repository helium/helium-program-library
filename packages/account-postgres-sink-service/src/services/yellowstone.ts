import { PublicKey } from "@solana/web3.js";
import Client, {
  SubscribeRequest,
  SubscribeUpdate,
  SubscribeUpdateAccount,
} from "@triton-one/yellowstone-grpc";
import retry from "async-retry";
import { FastifyInstance } from "fastify";
import { YELLOWSTONE_TOKEN, YELLOWSTONE_URL } from "../env";
import { getPluginsByAccountTypeByProgram } from "../plugins";
import { IConfig } from "../types";
import { convertYellowstoneTransaction } from "../utils/convertYellowstoneTransaction";
import { handleAccountWebhook } from "../utils/handleAccountWebhook";
import { handleTransactionWebhoook } from "../utils/handleTransactionWebhook";

export const setupYellowstone = async (
  server: FastifyInstance,
  configs: IConfig[]
) => {
  const pluginsByAccountTypeByProgram = await getPluginsByAccountTypeByProgram(
    configs
  );

  await retry(
    async () => {
      const client = new Client(YELLOWSTONE_URL, YELLOWSTONE_TOKEN, {
        "grpc.max_receive_message_length": 2065853043,
        "grpc.keepalive_time_ms": 10000,
        "grpc.keepalive_timeout_ms": 5000,
        "grpc.keepalive_permit_without_calls": 1,
      });

      const stream = await client.subscribe();
      console.log("Connected to Yellowstone");

      stream.on("data", async (data: SubscribeUpdate) => {
        try {
          if (data.transaction) {
            const transaction = await convertYellowstoneTransaction(
              data.transaction.transaction
            );

            if (transaction) {
              try {
                await handleTransactionWebhoook({
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
      };

      try {
        await new Promise<void>((resolve, reject) => {
          stream.write(request, (err: any) => {
            if (err === null || err === undefined) {
              resolve();
            } else {
              reject(err);
            }
          });
        });
      } catch (err: unknown) {
        console.error(`Failed to write initial request: ${err}`);
        throw err;
      }

      stream.on("error", (error) => {
        console.error("Yellowstone stream error:", error);
        stream.end();
        throw error;
      });

      stream.on("end", () => {
        console.log("Yellowstone stream ended");
        throw new Error("Stream ended");
      });

      stream.on("close", () => {
        console.log("Yellowstone stream closed");
        throw new Error("Stream closed");
      });
    },
    {
      retries: 10,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 60000,
      onRetry: (error, attempt) => {
        console.log(
          `Yellowstone retry attempt ${attempt} due to error:`,
          error
        );
      },
    }
  );
};
