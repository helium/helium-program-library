import Fastify from "fastify";
import fastifyCron from "fastify-cron";
import { StatusCodes, ReasonPhrases } from "http-status-codes";
import { PROGRAM_ID as HVSR_PROG_ID } from "@helium/voter-stake-registry-sdk";
import { upsertProgramAccounts } from "./utils/upsertProgramAccounts";

const server = Fastify();

server.get("/sync-vsr", async (req, res) => {
  try {
    await upsertProgramAccounts({
      programId: HVSR_PROG_ID,
      idlAccountTypes: ["PositionV0", "Registrar"],
    });
    res.code(StatusCodes.OK).send(ReasonPhrases.OK);
  } catch (err) {
    res
      .code(StatusCodes.INTERNAL_SERVER_ERROR)
      .send(ReasonPhrases.INTERNAL_SERVER_ERROR);
    console.error(err);
  }
});

server.register(fastifyCron, {
  jobs: [
    {
      cronTime: "0 0 * * *", // Everyday at midnight UTC
      onTick: async (server) => {
        try {
          await server.inject("/sync-vsr");
        } catch (err) {
          console.error(err);
        }
      },
    },
  ],
});

export default server;
