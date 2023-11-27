import cors from "@fastify/cors";
import Fastify, { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import { Op } from "sequelize";
import {
  Delegation,
  Position,
  Proposal,
  Proxy,
  ProxyRegistrar,
  Registrar,
  VoteMarker,
  sequelize,
} from "./model";
import { cloneRepo, readProxiesAndUpsert } from "./repo";
import fastifyStatic from "@fastify/static";
import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { organizationKey } from "@helium/organization-sdk";

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
    minIndex: number;
    position: string;
  };
}>("/delegations", async (request, reply) => {
  const {
    position,
    owner,
    nextOwner,
    page = 1,
    limit = 1000,
    minIndex,
  } = request.query;
  const where: any = {};
  if (owner) where.owner = owner;
  if (nextOwner) where.nextOwner = nextOwner;
  if (typeof minIndex !== "undefined") {
    where.index = {
      [Op.gte]: minIndex,
    };
  }

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
              address: position,
            },
            attributes: [],
            required: true,
          },
        ]
      : undefined,
    order: [["index", "DESC"]],
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
      floor(sum(p.ve_tokens)) as "delegatedVeTokens",
      100 * sum(p.ve_tokens) / (select total_vetokens from total_vetokens) as "percent"
    FROM
      proxies
    JOIN proxy_registrars pr ON pr.wallet = proxies.wallet 
    LEFT OUTER JOIN positions_with_delegations p ON p.owner = proxies.wallet
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

server.get<{
  Params: { registrar: string; wallet: string };
}>("/registrars/:registrar/proxies/:wallet", async (request, reply) => {
  const registrar = request.params.registrar;
  const escapedRegistrar = sequelize.escape(registrar);
  const wallet = request.params.wallet;
  const escapedWallet = sequelize.escape(request.params.wallet);

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
      floor(sum(p.ve_tokens)) as "delegatedVeTokens",
      100 * sum(p.ve_tokens) / (select total_vetokens from total_vetokens) as "percent"
    FROM
      proxies
    JOIN proxy_registrars pr ON pr.wallet = proxies.wallet 
    LEFT OUTER JOIN positions_with_delegations p ON p.owner = proxies.wallet
    WHERE pr.registrar = ${escapedRegistrar} AND proxies.wallet = ${escapedWallet}
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
LIMIT 1
      `);
  return proxies[0][0];
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

const ORG_IDS = {
  [HNT_MINT.toBase58()]: organizationKey("Helium")[0].toBase58(),
  [MOBILE_MINT.toBase58()]: organizationKey("Helium MOBILE")[0].toBase58(),
  [IOT_MINT.toBase58()]: organizationKey("Helium IOT")[0].toBase58(),
};

server.get<{
  Params: { registrar: string; wallet: string };
  Querystring: { limit: number; page: number };
}>("/registrars/:registrar/votes/:wallet", async (request, reply) => {
  const wallet = sequelize.escape(request.params.wallet);
  const registrar = sequelize.escape(request.params.registrar);
  const limit = Number(request.query.limit || 1000); // default limit
  const offset = Number((request.query.page || 1) - 1) * limit;
  const mint = (await Registrar.findByPk(request.params.registrar))
    ?.realmGoverningTokenMint;
  if (!mint) {
    return reply.code(404).send({
      error: "Mint not found",
    });
  }

  const result = await sequelize.query(`
WITH exploded_choice_vote_markers AS(
  SELECT voter, registrar, proposal, sum(weight) as weight, unnest(choices) as choice
  FROM vote_markers
  GROUP BY voter, registrar, proposal, choice
)
SELECT 
  p.*,
  json_agg(json_build_object(
    'voter', vms.voter,
    'registrar', vms.registrar,
    'weight', vms.weight,
    'choice', vms.choice,
    'choiceName', p.choices[vms.choice]->>'name'
  )) as votes
FROM exploded_choice_vote_markers vms
JOIN proposals p ON vms.proposal = p.address
WHERE p.namespace = ${sequelize.escape(
    ORG_IDS[mint]
  )} AND vms.registrar = ${registrar} AND vms.voter = ${wallet}
GROUP BY p.address
OFFSET ${offset}
LIMIT ${limit};
    `);
  return result[0];
});

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