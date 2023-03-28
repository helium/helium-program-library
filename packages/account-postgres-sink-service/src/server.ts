import Fastify from "fastify";
import fastifyCron from "fastify-cron";
import { StatusCodes, ReasonPhrases } from "http-status-codes";
import { PROGRAM_ID as HVSR_PROGRAM_ID } from "@helium/voter-stake-registry-sdk";
import { upsertProgramAccounts } from "./utils/upsertProgramAccounts";
import { GLOBAL_CRON_CONFIG } from "./env";

const server = Fastify();

server.get("/hvsr", async (_req, res) => {
  try {
    await upsertProgramAccounts({
      programId: HVSR_PROGRAM_ID,
      accounts: [
        { type: "PositionV0", table: "positions", schema: "hvsr" },
        { type: "Registrar", table: "registrars", schema: "hvsr" },
      ],
    });
    res.code(StatusCodes.OK).send(ReasonPhrases.OK);
  } catch (err) {
    res.code(StatusCodes.INTERNAL_SERVER_ERROR).send(err);
    console.error(err);
  }
});

server.register(fastifyCron, {
  jobs: [
    {
      cronTime: GLOBAL_CRON_CONFIG,
      runOnInit: true,
      onTick: async (server) => {
        try {
          await server.inject("/hvsr");
        } catch (err) {
          console.error(err);
        }
      },
    },
  ],
});

export default server;
