import NodeCache from "node-cache";
import { sequelize } from "@/lib/db";

const proxyCache = new NodeCache({ stdTTL: 600 });

interface GetProxiesArgs {
  registrar: string;
  page: number;
  limit: number;
  query?: string;
}

export async function getProxies(args: GetProxiesArgs) {
  const { registrar, page, limit, query = "" } = args;
  const offset = (page - 1) * limit;

  const cacheKey = `proxies:${registrar}:${limit}:${page}:${query}`;
  const cached = proxyCache.get(cacheKey);
  if (cached) return cached;

  const escapedRegistrar = sequelize.escape(registrar);
  const queryFilter = query
    ? `AND (proxies.name ILIKE ${sequelize.escape(`%${query}%`)} OR proxies.wallet ILIKE ${sequelize.escape(`%${query}%`)})`
    : "";

  const [rows] = await sequelize.query(`
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
          ${queryFilter}
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

  proxyCache.set(cacheKey, rows);
  return rows;
}

export async function getProxy(registrar: string, wallet: string) {
  const escapedRegistrar = sequelize.escape(registrar);
  const escapedWallet = sequelize.escape(wallet);

  const [rows] = await sequelize.query(`
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

  return (rows as unknown[])[0] ?? null;
}
