import cors from "@fastify/cors";
import Fastify, { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import { Op } from "sequelize";
import {
  Delegation,
  Position,
  Proxy,
  ProxyRegistrar,
  sequelize,
} from "./model";
import { cloneRepo, readProxiesAndUpsert } from "./repo";
import fastifyStatic from "@fastify/static";

const server: FastifyInstance = Fastify({
  logger: true,
});
server.register(cors, {
  origin: "*",
});

server.register(fastifyStatic, {
  root: path.join(__dirname, "../helium-vote-proxies"),
  prefix: "/helium-vote-proxies/",
});

server.get("/health", async () => {
  return { ok: true };
});
server.get("/sync", async () => {
  await cloneRepo();
  await readProxiesAndUpsert();
});

server.get<{
  Params: { position: string };
  Querystring: {
    page: number;
    limit: number;
    owner: string;
    nextOwner: string;
    position: string;
  };
}>("/delegations", async (request, reply) => {
  const { position, owner, nextOwner, page = 1, limit = 1000 } = request.query;
  const where: any = {};
  if (owner) where.owner = owner;
  if (nextOwner) where.nextOwner = nextOwner;

  const offset = (page - 1) * limit;

  return Delegation.findAll({
    where,
    offset,
    limit,
    include: position
      ? [
          {
            model: Position,
            where: {
              address: request.params.position,
            },
            attributes: [],
            required: true,
          },
        ]
      : undefined,
  });
});

server.get<{
  Params: { registrar: string };
  Querystring: { registrar: string; page: number; limit: number };
}>("/registrars/:registrar/proxies", async (request, reply) => {
  const limit = Number(request.query.limit || 1000); // default limit
  const offset = Number((request.query.page || 1) - 1) * limit;
  const registrar = request.params.registrar;
  const escapedRegistrar = sequelize.escape(registrar);

  const proxies = await sequelize.query(`
WITH 
  positions_with_delegations AS (
    SELECT
      *
    FROM
      positions_with_vetokens p
    JOIN delegations d on d.asset = p.asset
        AND d.next_owner = '11111111111111111111111111111111'
    WHERE registrar = ${escapedRegistrar}
  ),
  total_vetokens as (
    SELECT
      SUM(ve_tokens) total_vetokens
    FROM
      positions_with_vetokens
    WHERE
      registrar = ${escapedRegistrar}
  ),
  proxies_with_delegations AS (
    SELECT
      name,
      image,
      proxies.wallet as wallet,
      description,
      detail,
      count(p.owner) as "numDelegations",
      sum(p.ve_tokens) as "delegatedVeTokens",
      100 * sum(p.ve_tokens) / (select total_vetokens from total_vetokens) as "percent"
    FROM
      proxies
    JOIN proxy_registrars pr ON pr.wallet = proxies.wallet 
    JOIN positions_with_delegations p ON p.owner = proxies.wallet
    WHERE pr.registrar = ${escapedRegistrar}
    GROUP BY
      name,
      image,
      proxies.wallet,
      description,
      detail
  )
SELECT
  *
FROM proxies_with_delegations
ORDER BY "delegatedVeTokens" DESC
OFFSET ${offset}
LIMIT ${limit};
      `);
  return proxies[0];
});

server.get<{ Params: { registrar: string }; Querystring: { query: string } }>(
  "/registrars/:registrar/proxies/search",
  async (request, reply) => {
    const query = request.query.query;
    const registrar = request.params.registrar;
    const proxies = await Proxy.findAll({
      attributes: ["name", "description", "image", "wallet", "detail"],
      where: {
        [Op.or]: [{ name: { [Op.iLike]: `%${query}%` } }],
      },
      include: [
        {
          model: ProxyRegistrar,
          where: {
            registrar,
          },
          required: true,
          attributes: [],
        },
      ],
      limit: 10,
    });
    return proxies;
  }
);

const start = async () => {
  try {
    const port = process.env.PORT ? Number(process.env.PORT) : 8081;
    await server.listen({
      port,
      host: "0.0.0.0",
    });

    server.server.address();
    console.log(`Started server on 0.0.0.0:${port}`);

    await Proxy.sync({ alter: true });
    await ProxyRegistrar.sync({ alter: true });
    // Read SQL file
    const sqlFilePath = path.join(
      __dirname,
      "..",
      "positions_with_vetokens.sql"
    );
    const sqlQuery = fs.readFileSync(sqlFilePath, "utf8");

    // Execute SQL query
    await sequelize.query(sqlQuery);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
