import cors from "@fastify/cors";
import { EventEmitter } from "events";
import Fastify, { FastifyInstance } from "fastify";
import { ReasonPhrases, StatusCodes } from "http-status-codes";
import {
  PG_POOL_SIZE,
  ADMIN_PASSWORD,
  USE_SUBSTREAM,
  REFRESH_ON_BOOT,
} from "./env";
import { ensureTables } from "./utils/ensureTables";
import { setupSubstream } from "./services/substream";
import database from "./utils/database";
import { upsertOwners } from "./utils/upsertOwners";
import { metrics } from "./plugins/metrics";
import { provider } from "./utils/solana";
import { TransactionProcessor } from "./utils/processTransaction";
import bs58 from "bs58";

if (PG_POOL_SIZE < 5) {
  throw new Error("PG_POOL_SIZE must be minimum of 5");
}

(async () => {
  let server: FastifyInstance | undefined;
  const eventHandler = new EventEmitter();
  let refreshing: Promise<void> | undefined = undefined;
  eventHandler.on("refresh-owners", () => {
    if (!refreshing) {
      refreshing = (async () => {
        try {
          console.log("Refreshing owners");
          await upsertOwners({ sequelize: database });
          console.log(`Owners Refreshed`);
        } catch (err) {
          console.error(err);
        } finally {
          refreshing = undefined;
        }
      })();
    }
  });

  try {
    server = Fastify({ logger: false });
    await server.register(cors, { origin: "*" });
    await server.register(metrics);
    await ensureTables({ sequelize: database });
    await database.sync({ alter: true });

    server.get("/refresh-owners", async (req, res) => {
      const { password } = req.query as any;
      if (password !== ADMIN_PASSWORD) {
        res.code(StatusCodes.FORBIDDEN).send({
          message: "Invalid password",
        });
        return;
      }

      let prevRefreshing = refreshing;
      eventHandler.emit("refresh-owners");
      if (prevRefreshing) {
        res
          .code(StatusCodes.TOO_MANY_REQUESTS)
          .send(ReasonPhrases.TOO_MANY_REQUESTS);
      } else {
        res.code(StatusCodes.OK).send(ReasonPhrases.OK);
      }
    });

    server.get("/refreshing", async (req, res) => {
      res.code(StatusCodes.OK).send({
        refreshing: !!refreshing,
      });
    });

    server.post<{ Body: { signature: string; password: string } }>(
      "/process-transaction",
      async (req, res) => {
        const { signature, password } = req.body;
        if (password !== ADMIN_PASSWORD) {
          res.code(StatusCodes.FORBIDDEN).send({
            message: "Invalid password",
          });
          return;
        }

        try {
          // Fetch transaction
          const tx = await provider.connection.getTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          });

          if (!tx) {
            res.code(StatusCodes.NOT_FOUND).send({
              message: "Transaction not found",
            });
            return;
          }

          const processor = await TransactionProcessor.create();
          const dbTx = await database.transaction();

          try {
            const { message } = tx.transaction;
            const accountKeys = [
              ...message.staticAccountKeys,
              ...(tx.meta?.loadedAddresses?.writable || []),
              ...(tx.meta?.loadedAddresses?.readonly || []),
            ];

            await processor.processTransaction(
              {
                accountKeys,
                instructions: message.compiledInstructions,
                innerInstructions: tx.meta?.innerInstructions?.map((inner) => ({
                  index: inner.index,
                  instructions: inner.instructions.map((ix) => ({
                    programIdIndex: ix.programIdIndex,
                    accountKeyIndexes: ix.accounts,
                    data: bs58.decode(ix.data),
                  })),
                })),
              },
              dbTx,
              tx.slot
            );

            await dbTx.commit();
            res
              .code(StatusCodes.OK)
              .send({ message: "Transaction processed successfully" });
          } catch (err) {
            await dbTx.rollback();
            console.error("Error processing transaction:", err);
            res.code(StatusCodes.INTERNAL_SERVER_ERROR).send({
              message: "Error processing transaction",
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } catch (err) {
          console.error("Error fetching transaction:", err);
          res.code(StatusCodes.INTERNAL_SERVER_ERROR).send({
            message: "Error fetching transaction",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    );

    await server.listen({
      port: Number(process.env.PORT || "3000"),
      host: "0.0.0.0",
    });

    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);

    if (REFRESH_ON_BOOT) {
      console.log("Refreshing owners on boot...");
      // Wait for refresh to complete before continuing
      await new Promise<void>((resolve) => {
        const originalRefreshing = refreshing;
        eventHandler.emit("refresh-owners");

        // If refresh started, wait for it to complete
        if (refreshing && refreshing !== originalRefreshing) {
          refreshing.then(() => resolve()).catch(() => resolve());
        } else {
          resolve();
        }
      });
    }

    if (USE_SUBSTREAM) {
      await setupSubstream(server).catch((err: any) => {
        console.error("Fatal error in Substream connection:", err);
        process.exit(1);
      });
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
