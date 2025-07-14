import cors from "@fastify/cors";
import { EventEmitter } from "events";
import Fastify, { FastifyInstance } from "fastify";
import { ReasonPhrases, StatusCodes } from "http-status-codes";
import { PG_POOL_SIZE, ADMIN_PASSWORD, USE_SUBSTREAM } from "./env";
import { ensureTables } from "./utils/ensureTables";
import { setupSubstream } from "./services/substream";
import database from "./utils/database";
import { upsertOwners } from "./utils/upsertOwners";
import { metrics } from "./plugins/metrics";

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
    await database.sync();
    await database.query(
      "CREATE INDEX IF NOT EXISTS idx_assest_owner_asset ON asset_owners(asset);"
    );

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

    await server.listen({
      port: Number(process.env.PORT || "3000"),
      host: "0.0.0.0",
    });

    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);
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
