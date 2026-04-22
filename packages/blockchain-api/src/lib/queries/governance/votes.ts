import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { organizationKey } from "@helium/organization-sdk";
import { sequelize } from "@/lib/db";
import { Registrar } from "@/lib/models/governance/registrar";
import { deepCamelCaseKeys } from "@/lib/utils/camel-case";

const ORG_IDS: Record<string, string> = {
  [HNT_MINT.toBase58()]: organizationKey("Helium")[0].toBase58(),
  [MOBILE_MINT.toBase58()]: organizationKey("Helium MOBILE")[0].toBase58(),
  [IOT_MINT.toBase58()]: organizationKey("Helium IOT")[0].toBase58(),
};

interface GetVotesByWalletArgs {
  registrar: string;
  wallet: string;
  page: number;
  limit: number;
}

export async function getVotesByWallet(
  args: GetVotesByWalletArgs,
): Promise<unknown[] | null> {
  const registrarRow = await Registrar.findByPk(args.registrar);
  const mint = registrarRow?.realmGoverningTokenMint;
  if (!mint) return null;

  const orgId = ORG_IDS[mint];
  if (!orgId) return null;

  const escapedWallet = sequelize.escape(args.wallet);
  const escapedRegistrar = sequelize.escape(args.registrar);
  const escapedOrg = sequelize.escape(orgId);
  const offset = (args.page - 1) * args.limit;

  const [rows] = await sequelize.query(`
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
LEFT OUTER JOIN exploded_choice_vote_markers vms ON vms.proposal = p.address AND vms.registrar = ${escapedRegistrar} AND vms.voter = ${escapedWallet}
WHERE p.namespace = ${escapedOrg}
GROUP BY p.address
ORDER BY created_at DESC
OFFSET ${offset}
LIMIT ${args.limit};
  `);

  return (rows as unknown[]).map(deepCamelCaseKeys);
}

export async function getProposalVotes(proposal: string): Promise<unknown[]> {
  const escapedProposal = sequelize.escape(proposal);
  const [rows] = await sequelize.query(`
WITH exploded_choice_vote_markers AS (
  SELECT voter, registrar, proposal, sum(weight) as weight, unnest(choices) as choice
  FROM vote_markers
  WHERE proposal = ${escapedProposal}
  GROUP BY voter, registrar, proposal, choice
)
SELECT
  vm.voter,
  vm.registrar,
  vm.proposal,
  vm.weight,
  vm.choice,
  p.choices[vm.choice + 1]->>'name' as "choiceName",
  proxies.name as "proxyName"
FROM exploded_choice_vote_markers vm
JOIN proposals p ON p.address = vm.proposal
LEFT OUTER JOIN proxies ON proxies.wallet = vm.voter
  `);

  return (rows as unknown[]).map(deepCamelCaseKeys);
}
