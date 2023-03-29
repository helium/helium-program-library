import Fastify, { FastifyInstance } from "fastify";
import fastifyCron from "fastify-cron";
import cors from "@fastify/cors";
import { StatusCodes, ReasonPhrases } from "http-status-codes";
import { upsertProgramAccounts } from "./utils/upsertProgramAccounts";
import { GLOBAL_CRON_CONFIG } from "./env";
import { PROGRAM_ID as HLT_PROGRAM_ID } from "@helium/lazy-transactions-sdk";
import { PROGRAM_ID as HVSR_PROGRAM_ID } from "@helium/voter-stake-registry-sdk";
import { PROGRAM_ID as HSD_PROGRAM_ID } from "@helium/helium-sub-daos-sdk";

const server: FastifyInstance = Fastify({
  logger: true,
});

server.register(cors, {
  origin: "*",
});

server.get("/hlt", async (_reg, res) => {
  try {
    // HLT
    await upsertProgramAccounts({
      programId: HLT_PROGRAM_ID,
      accounts: [
        {
          type: "LazyTransactionsV0",
          table: "lazy_transactions",
          schema: "hlt",
        },
        { type: "Block", table: "blocks", schema: "hlt" },
      ],
    });
    res.code(StatusCodes.OK).send(ReasonPhrases.OK);
  } catch (err) {
    res.code(StatusCodes.INTERNAL_SERVER_ERROR).send(err);
    console.error(err);
  }
});

server.get("/hvsr", async (_req, res) => {
  try {
    // HVSR
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

server.get("/hsd", async (_reg, res) => {
  try {
    // HSD
    await upsertProgramAccounts({
      programId: HSD_PROGRAM_ID,
      accounts: [
        { type: "DaoV0", table: "daos", schema: "hsd" },
        { type: "SubDaoV0", table: "sub_daos", schema: "hsd" },
        {
          type: "SubDaoEpochInfoV0",
          table: "sub_dao_epoc_info",
          schema: "hsd",
        },
        {
          type: "DelegatedPositionV0",
          table: "delegated_positions",
          schema: "hsd",
        },
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
          await server.inject("/hlt");
        } catch (err) {
          console.error(err);
        }
      },
    },
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
    {
      cronTime: GLOBAL_CRON_CONFIG,
      runOnInit: true,
      onTick: async (server) => {
        try {
          await server.inject("/hsd");
        } catch (err) {
          console.error(err);
        }
      },
    },
  ],
});

export default server;
