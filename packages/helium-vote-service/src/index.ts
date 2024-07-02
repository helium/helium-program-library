import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { organizationKey } from "@helium/organization-sdk";
import {
  Asset,
  HNT_MINT,
  IOT_MINT,
  MOBILE_MINT,
  searchAssets,
} from "@helium/spl-utils";
import {
  getPositionKeysForOwner,
  registrarCollectionKey,
} from "@helium/voter-stake-registry-sdk";
import Fastify, { FastifyInstance } from "fastify";
import fs from "fs";
import { camelCase, isPlainObject, mapKeys } from "lodash";
import path from "path";
import { Op } from "sequelize";
import { SOLANA_URL } from "./env";
import {
  Position,
  Proxy,
  ProxyAssignment,
  ProxyRegistrar,
  Registrar,
  sequelize,
  setRelations,
} from "./model";
import { cloneRepo, readProxiesAndUpsert } from "./repo";
import { Connection, PublicKey } from "@solana/web3.js";

const server: FastifyInstance = Fastify({
  logger: true,
});
server.register(cors, {
  origin: "*",
});

server.register(fastifyStatic, {
  root: path.join(
    __dirname,
    process.env.NODE_ENV === "production"
      ? "../../helium-vote-proxies"
      : "../helium-vote-proxies"
  ),
  prefix: "/helium-vote-proxies/",
});

server.get("/health", async () => {
  return { ok: true };
});
server.get("/v1/sync", async () => {
  await cloneRepo();
  await readProxiesAndUpsert();
});

const registrarsByMint = {
  [HNT_MINT.toBase58()]: new PublicKey(
    "BMnWRWZrWqb6JMKznaDqNxWaWAHoaTzVabM6Qwyh3WKz"
  ),
  [IOT_MINT.toBase58()]: new PublicKey(
    "7ZZopN1mx6ECcb3YCG8dbxeLpA44xq4gzA1ETEiaLoeL"
  ),
  [MOBILE_MINT.toBase58()]: new PublicKey(
    "C4DWaps9bLiqy4e81wJ7VTQ6QR7C4MWvwsei3ZjsaDuW"
  ),
};
server.get<{
  Params: { registrar: string };
  Querystring: {
    page: number;
    limit: number;
    voter: string;
    nextVoter: string;
    minIndex: number;
    position: string;
  };
}>("/v1/registrars/:registrar/proxy-assignments", async (request) => {
  const {
    position,
    voter: voter,
    nextVoter,
    page = 1,
    limit = 1000,
    minIndex,
  } = request.query;
  const where: any = {};
  if (voter) {
    const registrar = request.params.registrar;
    const { assets } = await getPositionKeysForOwner({
      connection: new Connection(SOLANA_URL),
      owner: new PublicKey(voter),
      registrar: new PublicKey(registrar),
    });

    where[Op.or] = [
      {
        voter,
      },
      {
        [Op.and]: [
          {
            asset: {
              [Op.in]: assets.map((a) => a.toBase58()),
            },
            voter: PublicKey.default.toBase58(),
          },
        ],
      },
    ];
  }
  if (nextVoter) where.nextVoter = nextVoter;
  if (typeof minIndex !== "undefined") {
    where.index = {
      [Op.gte]: minIndex,
    };
  }

  const offset = (page - 1) * limit;

  return ProxyAssignment.findAll({
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
  Querystring: {
    page: number;
    limit: number;
    query: string;
  };
}>("/v1/registrars/:registrar/proxies", async (request, reply) => {
  const limit = Number(request.query.limit || 1000); // default limit
  const offset = Number((request.query.page || 1) - 1) * limit;
  const registrar = request.params.registrar;
  const escapedRegistrar = sequelize.escape(registrar);

  const proxies = await sequelize.query(`
WITH 
  positions_with_proxy_assignments AS (
    SELECT
      *
    FROM
      positions_with_vetokens p
    JOIN proxy_assignments d on d.asset = p.asset
        AND d.next_voter = '11111111111111111111111111111111'
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
  proxies_with_assignments AS (
    SELECT
      name,
      image,
      proxies.wallet as wallet,
      description,
      detail,
      count(p.voter) as "numAssignments",
      floor(sum(p.ve_tokens)) as "delegatedVeTokens",
      100 * sum(p.ve_tokens) / (select total_vetokens from total_vetokens) as "percent"
    FROM
      proxies
    JOIN proxy_registrars pr ON pr.wallet = proxies.wallet 
    LEFT OUTER JOIN positions_with_proxy_assignments p ON p.voter = proxies.wallet
    WHERE pr.registrar = ${escapedRegistrar}
          ${
            request.query.query
              ? `AND (proxies.name ILIKE ${sequelize.escape(
                  `%${request.query.query}%`
                )} OR proxies.wallet ILIKE ${sequelize.escape(
                  `%${request.query.query}%`
                )})`
              : ""
          }
    GROUP BY
      name,
      image,
      proxies.wallet,
      description,
      detail
  )
SELECT
  pa.*,
  COUNT(distinct vm.proposal) as "numProposalsVoted",
  MAX(vm.created_at) as "lastVotedAt"
FROM proxies_with_assignments pa
LEFT OUTER JOIN vote_markers vm ON vm.voter = pa.wallet
GROUP BY pa.name, pa.image, pa.wallet, pa.description, pa.detail, pa."numAssignments", pa."delegatedVeTokens", pa.percent
ORDER BY "delegatedVeTokens" DESC
OFFSET ${offset}
LIMIT ${limit};
      `);
  return proxies[0];
});

server.get<{
  Params: { registrar: string; wallet: string };
}>("/v1/registrars/:registrar/proxies/:wallet", async (request, reply) => {
  const registrar = request.params.registrar;
  const escapedRegistrar = sequelize.escape(registrar);
  const escapedWallet = sequelize.escape(request.params.wallet);

  const proxies = await sequelize.query(`
WITH 
  positions_with_proxy_assignments AS (
    SELECT
      *
    FROM
      positions_with_vetokens p
    JOIN proxy_assignments d on d.asset = p.asset
        AND d.next_voter = '11111111111111111111111111111111'
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
  proxies_with_assignments AS (
    SELECT
      name,
      image,
      p.voter as wallet,
      description,
      detail,
      count(p.voter) as "numAssignments",
      floor(sum(p.ve_tokens)) as "delegatedVeTokens",
      100 * sum(p.ve_tokens) / (select total_vetokens from total_vetokens) as "percent"
    FROM
      positions_with_proxy_assignments p
    LEFT OUTER JOIN proxy_registrars pr ON p.voter = pr.wallet AND p.registrar = pr.registrar
    LEFT OUTER JOIN proxies ON pr.wallet = proxies.wallet 
    WHERE p.registrar = ${escapedRegistrar} AND p.voter = ${escapedWallet}
    GROUP BY
      name,
      image,
      p.voter,
      description,
      detail
  ),
  proxies_with_rank AS(
      SELECT
        pa.*,
        COUNT(*) OVER () as "numProxies",
        RANK() OVER (ORDER BY "delegatedVeTokens" DESC) as rank
      FROM proxies_with_assignments pa
  ),
  proxies_with_votes AS (
    SELECT
      name,
      image,
      wallet,
      description,
      detail,
      "numAssignments",
      "delegatedVeTokens",
      "percent",
      "numProxies",
      rank,
      count(distinct vm.proposal) as "numProposalsVoted",
      MAX(vm.created_at) as "lastVotedAt"
    FROM
      proxies_with_rank proxies
    LEFT OUTER JOIN vote_markers vm ON vm.voter = proxies.wallet AND vm.registrar = ${escapedRegistrar}
    GROUP BY "numProxies", rank, name, image, wallet, description, detail, "numAssignments", "delegatedVeTokens", "percent"
  )
SELECT
  *
FROM proxies_with_votes
LIMIT 1
      `);

  `
  WITH 
  positions_with_proxy_assignments AS (
    SELECT
      *
    FROM
      positions_with_vetokens p
    JOIN proxy_assignments d on d.asset = p.asset
        AND d.next_voter = '11111111111111111111111111111111'
    WHERE registrar = 'BMnWRWZrWqb6JMKznaDqNxWaWAHoaTzVabM6Qwyh3WKz'
  ),
  total_vetokens as (
    SELECT
      SUM(ve_tokens) total_vetokens
    FROM
      positions_with_vetokens
    WHERE
      registrar = 'BMnWRWZrWqb6JMKznaDqNxWaWAHoaTzVabM6Qwyh3WKz'
  ),
  proxies_with_assignments AS (
    SELECT
      name,
      image,
      proxies.wallet as wallet,
      description,
      detail,
      count(p.voter) as "numAssignments",
      floor(sum(p.ve_tokens)) as "delegatedVeTokens",
      100 * sum(p.ve_tokens) / (select total_vetokens from total_vetokens) as "percent"
    FROM
      positions_with_proxy_assignments p
    LEFT OUTER JOIN proxy_registrars pr ON p.voter = pr.wallet AND p.registrar = pr.registrar
    LEFT OUTER JOIN proxies ON pr.wallet = proxies.wallet 
    WHERE p.registrar = 'BMnWRWZrWqb6JMKznaDqNxWaWAHoaTzVabM6Qwyh3WKz'
    GROUP BY
      name,
      image,
      proxies.wallet,
      description,
      detail
  ),
  proxies_with_rank AS(
      SELECT
        pa.*,
        COUNT(*) OVER () as "numProxies",
        RANK() OVER (ORDER BY "delegatedVeTokens" DESC) as rank
      FROM proxies_with_assignments pa
  ),
  proxies_with_votes AS (
    SELECT
      name,
      image,
      wallet,
      description,
      detail,
      "numAssignments",
      "delegatedVeTokens",
      "percent",
      "numProxies",
      rank,
      count(distinct vm.proposal) as "numProposalsVoted",
      MAX(vm.created_at) as "lastVotedAt"
    FROM
      proxies_with_rank proxies
    LEFT OUTER JOIN vote_markers vm ON vm.voter = proxies.wallet AND vm.registrar = 'BMnWRWZrWqb6JMKznaDqNxWaWAHoaTzVabM6Qwyh3WKz'
    GROUP BY "numProxies", rank, name, image, wallet, description, detail, "numAssignments", "delegatedVeTokens", "percent"
  )
  `;
  return proxies[0][0];
});

server.get<{
  Params: { wallet: string };
}>("/v1/proxies/:wallet/registrars", async (request, reply) => {
  const wallet = request.params.wallet;
  const registrars = await ProxyRegistrar.findAll({
    where: {
      wallet,
    },
  });
  return registrars.map((r) => r.registrar);
});

const ORG_IDS = {
  [HNT_MINT.toBase58()]: organizationKey("Helium")[0].toBase58(),
  [MOBILE_MINT.toBase58()]: organizationKey("Helium MOBILE")[0].toBase58(),
  [IOT_MINT.toBase58()]: organizationKey("Helium IOT")[0].toBase58(),
};

server.get<{
  Params: { registrar: string; wallet: string };
  Querystring: { limit: number; page: number };
}>("/v1/registrars/:registrar/votes/:wallet", async (request, reply) => {
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
    'choiceName', p.choices[vms.choice + 1]->>'name'
  )) as votes
FROM proposals p
LEFT OUTER JOIN exploded_choice_vote_markers vms ON vms.proposal = p.address AND vms.registrar = ${registrar} AND vms.voter = ${wallet}
WHERE p.namespace = ${sequelize.escape(ORG_IDS[mint])}
GROUP BY p.address
ORDER BY created_at DESC
OFFSET ${offset}
LIMIT ${limit};
    `);
  return result[0].map(deepCamelCaseKeys);
});

function deepCamelCaseKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(deepCamelCaseKeys);
  } else if (isPlainObject(obj)) {
    return mapKeys(
      Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [
          camelCase(key),
          deepCamelCaseKeys(value),
        ])
      ),
      (value, key) => camelCase(key)
    );
  } else {
    return obj;
  }
}

const start = async () => {
  try {
    await ProxyRegistrar.sync({ alter: true });
    await Proxy.sync({ alter: true });
    const port = process.env.PORT ? Number(process.env.PORT) : 8081;
    await server.listen({
      port,
      host: "0.0.0.0",
    });

    server.server.address();
    console.log(`Started server on 0.0.0.0:${port}`);

    setRelations();

    // Read SQL file
    const sqlFilePath = path.join(
      __dirname,
      process.env.NODE_ENV === "production" ? "../.." : "..",
      "positions_with_vetokens.sql"
    );
    const sqlQuery = fs.readFileSync(sqlFilePath, "utf8");

    // Execute SQL query
    await sequelize.query(sqlQuery);
    await cloneRepo();
    await readProxiesAndUpsert();
    console.log("Created models");
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
