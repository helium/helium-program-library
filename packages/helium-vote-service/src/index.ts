import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { organizationKey } from "@helium/organization-sdk";
import { createMemoInstruction } from "@solana/spl-memo";
import { DuneClient } from "@duneanalytics/client-sdk";
import {
  createAtaAndTransferInstructions,
  HNT_MINT,
  IOT_MINT,
  MOBILE_MINT,
} from "@helium/spl-utils";
import {
  getPositionKeysForOwner,
  init,
  positionKey,
  proxyVoteMarkerKey,
  voteMarkerKey,
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
  VoteMarker,
  Registrar,
  sequelize,
  setRelations,
} from "./model";
import { cloneRepo, readProxiesAndUpsert } from "./repo";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  compileTransaction,
  customSignerKey,
  RemoteTaskTransactionV0,
} from "@helium/tuktuk-sdk";
import { sign } from "tweetnacl";
import {
  getPrograms,
  provider,
  tuktukProgram,
  proposalProgram,
  voterStakeRegistryProgram,
  keypair,
  heliumSubDaosProgram,
  hplCronsProgram,
  stateControllerProgram,
} from "./solana";
import NodeCache from "node-cache";
import BN from "bn.js";
import { SystemProgram } from "@solana/web3.js";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";

const ORG_IDS = {
  [HNT_MINT.toBase58()]: organizationKey("Helium")[0].toBase58(),
  [MOBILE_MINT.toBase58()]: organizationKey("Helium MOBILE")[0].toBase58(),
  [IOT_MINT.toBase58()]: organizationKey("Helium IOT")[0].toBase58(),
};

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

// Save for one day
const CACHE_TIME = 1000 * 60 * 60 * 24
let cachedDataBurn: any | null = null
let lastCacheUpdate: Date | null = null
server.get("/v1/data-burn", async (request, reply) => {
  if (cachedDataBurn && lastCacheUpdate && lastCacheUpdate.getTime() > Date.now() - CACHE_TIME) {
    return cachedDataBurn
  }

  const client = new DuneClient(process.env.DUNE_API_KEY || "")
  const result = await client.getLatestResult({ queryId: 5069123 })
  cachedDataBurn = result.result?.rows.reduce((acc, row: any) => {
    acc[row.subdao] = row.dc_burned
    return acc
  }, {} as Record<string, number>)
  lastCacheUpdate = new Date()
  return cachedDataBurn
});

let cachedDataSubDaoDelegations: any | null = null
let lastCacheUpdateSubDaoDelegations: Date | null = null
server.get("/v1/subdao-delegations", async (request, reply) => {
  if (cachedDataSubDaoDelegations && lastCacheUpdateSubDaoDelegations && lastCacheUpdateSubDaoDelegations.getTime() > Date.now() - CACHE_TIME) {
    return cachedDataSubDaoDelegations
  }

  const vetokens = await sequelize.query(`
SELECT
  sum(ve_tokens) as "totalVeTokens",
  sub_dao as "subDao"
FROM positions_with_vetokens p
JOIN delegated_positions d on d.position = p.address
WHERE d.expiration_ts >= (floor(current_ts / (60 * 60 * 24)) * (60 * 60 * 24)) + 60 * 60 * 24 AND (
        lockup_kind = 'constant'
        or end_ts >= (
          floor(current_ts / (60 * 60 * 24)) * (60 * 60 * 24)
        ) + 60 * 60 * 24
      )
GROUP BY sub_dao
      `);
  const result = vetokens[0];

  const data = result.reduce((acc: Record<string, number>, row: any) => {
    const subDaoStr = row.subDao == subDaoKey(MOBILE_MINT)[0].toBase58() ? "mobile" : row.subDao == subDaoKey(IOT_MINT)[0].toBase58() ? "iot" : null;
    if (subDaoStr) {
      acc[subDaoStr] = row.totalVeTokens.split(".")[0];
    }
    return acc;
  }, {} as Record<string, number>);
  cachedDataSubDaoDelegations = data
  lastCacheUpdateSubDaoDelegations = new Date()
  return data
})

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
  const registrar = request.params.registrar;
  if (voter) {
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
  where.expirationTime = {
    [Op.gt]: new Date().valueOf() / 1000,
  };
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
      : [
        {
          model: Position,
          where: {
            registrar: registrar,
          },
          attributes: [],
          required: true,
        },
      ],
    order: [["index", "DESC"]],
  });
});

// Create cache instance with 10 minute TTL
const proxyCache = new NodeCache({ stdTTL: 600 }); // 600 seconds = 10 minutes

server.get<{
  Params: { registrar: string };
  Querystring: {
    page: number;
    limit: number;
    query: string;
  };
}>("/v1/registrars/:registrar/proxies", async (request, reply) => {
  const limit = Number(request.query.limit || 1000);
  const page = Number(request.query.page || 1);
  const offset = Number((request.query.page || 1) - 1) * limit;
  const registrar = request.params.registrar;
  const query = request.query.query || "";

  // Create cache key from all params
  const cacheKey = `proxies:${registrar}:${limit}:${page}:${query}`;

  // Try to get from cache first
  const cachedResult = proxyCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

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
        AND d.expiration_time > EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)
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
      floor(sum(p.ve_tokens)) as "proxiedVeTokens",
      CASE 
        WHEN (select total_vetokens from total_vetokens) = 0 THEN 0
        ELSE 100 * sum(COALESCE(p.ve_tokens, 0)) / (select total_vetokens from total_vetokens)
      END as "percent"
    FROM
      proxies
    JOIN proxy_registrars pr ON pr.wallet = proxies.wallet
    LEFT OUTER JOIN positions_with_proxy_assignments p ON p.voter = proxies.wallet
    WHERE pr.registrar = ${escapedRegistrar}
          ${request.query.query
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
GROUP BY pa.name, pa.image, pa.wallet, pa.description, pa.detail, pa."numAssignments", pa."proxiedVeTokens", pa.percent
ORDER BY "proxiedVeTokens" DESC NULLS LAST
OFFSET ${offset}
LIMIT ${limit};
      `);
  const result = proxies[0];

  // Store in cache before returning
  proxyCache.set(cacheKey, result);

  return result;
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
        AND d.expiration_time > EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)
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
      all_wallets.wallet as wallet,
      description,
      detail,
      count(p.voter) as "numAssignments",
      floor(sum(p.ve_tokens)) as "proxiedVeTokens",
      CASE 
        WHEN (select total_vetokens from total_vetokens) = 0 THEN 0
        ELSE 100 * sum(COALESCE(p.ve_tokens, 0)) / (select total_vetokens from total_vetokens)
      END as "percent"
    FROM
      (SELECT DISTINCT voter as wallet FROM positions_with_proxy_assignments
       UNION
       SELECT proxies.wallet FROM proxies JOIN proxy_registrars pr ON pr.wallet = proxies.wallet WHERE pr.registrar = ${escapedRegistrar}) AS all_wallets
    LEFT OUTER JOIN positions_with_proxy_assignments p ON p.voter = all_wallets.wallet
    LEFT OUTER JOIN proxies ON all_wallets.wallet = proxies.wallet
    GROUP BY
      name,
      image,
      all_wallets.wallet,
      description,
      detail
  ),
  proxies_with_rank AS(
      SELECT
        pa.*,
        COUNT(*) OVER () as "numProxies",
        RANK() OVER (ORDER BY "proxiedVeTokens" DESC NULLS LAST) as rank
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
      "proxiedVeTokens",
      "percent",
      "numProxies",
      rank,
      count(distinct vm.proposal) as "numProposalsVoted",
      MAX(vm.created_at) as "lastVotedAt"
    FROM
      proxies_with_rank proxies
    LEFT OUTER JOIN vote_markers vm ON vm.voter = proxies.wallet AND vm.registrar = ${escapedRegistrar}
    GROUP BY "numProxies", rank, name, image, wallet, description, detail, "numAssignments", "proxiedVeTokens", "percent"
  )
SELECT
  *
FROM proxies_with_votes
WHERE wallet = ${escapedWallet}
LIMIT 1
      `);
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

server.get<{
  Params: { proposal: string };
}>("/v1/proposals/:proposal/votes", async (request, reply) => {
  const proposal = sequelize.escape(request.params.proposal);

  return (
    await sequelize.query(`
      WITH exploded_choice_vote_markers AS (
        SELECT voter, registrar, proposal, sum(weight) as weight, unnest(choices) as choice
        FROM vote_markers
        WHERE proposal = ${proposal}
        GROUP BY voter, registrar, proposal, choice
      )
      SELECT
        vm.voter,
        vm.registrar,
        vm.proposal,
        vm.weight,
        vm.choice,
        p.choices[vm.choice + 1]->>'name' as "choiceName"
      FROM exploded_choice_vote_markers vm
      JOIN proposals p ON p.address = vm.proposal
    `)
  )[0].map(deepCamelCaseKeys);
});

const HNT_REGISTRAR = new PublicKey(
  "BMnWRWZrWqb6JMKznaDqNxWaWAHoaTzVabM6Qwyh3WKz"
);
const HELIUM_PROXY_CONFIG = new PublicKey(
  "ADWefNt1foP9YJamZFjcUwuMUanw29bEhtsHBEbfKpWZ"
);
const MAX_VOTES_PER_TASK = 1;
const MARKERS_TO_CHECK = 10;

server.post<{
  Params: { proposal: string; wallet: string };
  Body: { task_queue: string; task: string; task_queued_at: number };
}>("/v1/proposals/:proposal/proxy-vote/:wallet", async (request, reply) => {
  const proposal = new PublicKey(request.params.proposal);
  const wallet = new PublicKey(request.params.wallet);
  await getPrograms();

  const taskQueue = new PublicKey(request.body.task_queue);
  const task = new PublicKey(request.body.task);
  const taskQueuedAt = new BN(request.body.task_queued_at);
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
  const proxyVoteMarker = proxyVoteMarkerKey(wallet, proposal)[0];
  const choices = (
    await voterStakeRegistryProgram.account.proxyMarkerV0.fetch(proxyVoteMarker)
  ).choices;
  const proposalAccount = await proposalProgram.account.proposalV0.fetch(
    proposal
  );
  const proposalConfig = await proposalProgram.account.proposalConfigV0.fetch(
    proposalAccount.proposalConfig
  );
  const resolutionSettingsAccount = await stateControllerProgram.account.resolutionSettingsV0.fetch(proposalConfig.stateController);
  const endTs =
    (proposalAccount.state.resolved
      ?
      new BN(proposalAccount.state.resolved.endTs)
      :
      new BN(proposalAccount.state.voting!.startTs).add(
        resolutionSettingsAccount.settings.nodes.find(
          (node) => typeof node.offsetFromStartTs !== "undefined"
        )?.offsetFromStartTs?.offset ?? new BN(0)
      ))
  try {
    const needsVoteRaw = (
      await sequelize.query(`
            SELECT
              pa.asset,
              pa.address as proxy_assignment,
              dp.address as delegated_position
            FROM proxy_assignments pa
            JOIN positions p ON p.mint = pa.asset AND p.registrar = '${HNT_REGISTRAR.toBase58()}'
            LEFT OUTER JOIN vote_markers vm ON vm.mint = pa.asset AND (
              vm.registrar = '${HNT_REGISTRAR.toBase58()}' AND vm.proposal = '${proposal.toBase58()}'
            )
            LEFT OUTER JOIN delegated_positions dp ON dp.mint = pa.asset
            WHERE pa.proxy_config = '${HELIUM_PROXY_CONFIG.toBase58()}' AND pa.voter = '${wallet.toBase58()}' AND pa.index > 0 AND pa.expiration_time > FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)) AND (
              vm is NULL
              OR (
                vm.proxy_index >= pa.index AND
                (
                  NOT vm.choices <@ ARRAY[${choices.join(",")}]::integer[] OR
                  NOT vm.choices @> ARRAY[${choices.join(",")}]::integer[]
                )
              )
            )
            LIMIT ${MARKERS_TO_CHECK}
          `)
    )[0].map(deepCamelCaseKeys);

    // Check against the RPC as it's more up-to-date
    let needsVote: any[] = [];
    for (const vote of needsVoteRaw) {
      if (needsVote.length >= MAX_VOTES_PER_TASK) {
        break;
      }
      const marker = voteMarkerKey(new PublicKey(vote.asset), proposal)[0];
      const markerAccount =
        await voterStakeRegistryProgram.account.voteMarkerV0.fetchNullable(
          marker
        );
      if (!markerAccount || !arrayEquals(markerAccount.choices, choices)) {
        needsVote.push(vote);
      }
    }

    if (needsVote.length === 0 && needsVoteRaw.length === MARKERS_TO_CHECK) {
      reply.code(503).send({
        error: "Service Unavailable",
        message:
          "Indexer is still processing recent transactions, please retry later",
      });
      return;
    }

    const [pdaWallet, bump] = customSignerKey(taskQueue, [
      Buffer.from("vote_payer"),
      wallet.toBuffer(),
    ]);
    const bumpBuffer = Buffer.alloc(1);
    bumpBuffer.writeUint8(bump);
    let instructions: TransactionInstruction[] = [];
    // Done end the task chain.
    if (needsVote.length === 0) {
      instructions.push(
        createMemoInstruction(
          `Voting done for voter ${wallet.toBase58()} proposal ${proposal.toBase58()}`,
          [pdaWallet]
        )
      );
    } else {
      instructions.push(
        // Fund the next crank turn
        SystemProgram.transfer({
          fromPubkey: pdaWallet,
          toPubkey: task,
          lamports: 2 * taskQueueAcc.minCrankReward.toNumber() * needsVote.length,
        }),
        // Count as many votes as possible
        ...(
          await Promise.all(
            needsVote.map(async (vote) => {
              const instructions: TransactionInstruction[] = [];
              const { instruction: countIx, pubkeys: { marker, position } } = await voterStakeRegistryProgram.methods
                .countProxyVoteV0()
                .accountsPartial({
                  payer: pdaWallet,
                  proxyMarker: proxyVoteMarker,
                  voter: wallet,
                  proxyAssignment: new PublicKey(vote.proxyAssignment),
                  registrar: HNT_REGISTRAR,
                  position: positionKey(new PublicKey(vote.asset))[0],
                  proposal,
                  proposalConfig: proposalAccount.proposalConfig,
                  stateController: proposalConfig.stateController,
                  onVoteHook: proposalConfig.onVoteHook,
                })
                .prepare();
              instructions.push(countIx);
              const closeIx = await hplCronsProgram.methods.requeueRelinquishExpiredVoteMarkerV0({
                triggerTs: endTs
              })
                .accounts({
                  marker: marker!,
                  position: position!
                })
                .instruction();
              instructions.push(closeIx)
              return instructions;
            })
          )
        ).flat(),
        // Requeue ourselves
        await hplCronsProgram.methods
          .requeueProxyVoteV0()
          .accountsPartial({
            marker: proxyVoteMarker,
          })
          .instruction()
      );
    }

    const { transaction, remainingAccounts } = await compileTransaction(
      instructions,
      [[Buffer.from("vote_payer"), wallet.toBuffer(), bumpBuffer]]
    );
    const remoteTx = new RemoteTaskTransactionV0({
      task,
      taskQueuedAt,
      transaction: {
        ...transaction,
        accounts: remainingAccounts.map((acc) => acc.pubkey),
      },
    });
    const serialized = await RemoteTaskTransactionV0.serialize(
      tuktukProgram.coder.accounts,
      remoteTx
    );
    const resp = {
      transaction: serialized.toString("base64"),
      signature: Buffer.from(
        sign.detached(Uint8Array.from(serialized), keypair.secretKey)
      ).toString("base64"),
      remaining_accounts: remainingAccounts.map((acc) => ({
        pubkey: acc.pubkey.toBase58(),
        is_signer: acc.isSigner,
        is_writable: acc.isWritable,
      })),
    };
    reply.status(200).send(resp);
  } catch (err) {
    console.error(err);
    reply.status(500).send({
      message: "Request failed",
    });
  }
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

const MODIFY_DB = (process.env.MODIFY_DB || "true") === "true";
const start = async () => {
  try {
    await ProxyRegistrar.sync({ alter: MODIFY_DB });
    await Proxy.sync({ alter: MODIFY_DB });
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
    if (MODIFY_DB) {
      await sequelize.query(sqlQuery);
    }
    await cloneRepo();
    await readProxiesAndUpsert();
    console.log("Created models");
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

function arrayEquals(choices: number[], choices1: number[]) {
  if (choices.length !== choices1.length) return false;

  // Sort both arrays to normalize order
  const sorted1 = [...choices].sort((a, b) => a - b);
  const sorted2 = [...choices1].sort((a, b) => a - b);

  // Compare sorted arrays
  for (let i = 0; i < sorted1.length; i++) {
    if (sorted1[i] !== sorted2[i]) return false;
  }

  return true;
}
