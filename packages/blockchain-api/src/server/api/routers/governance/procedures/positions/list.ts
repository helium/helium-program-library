import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection } from "@/lib/solana";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  daoKey,
  delegatedPositionKey,
  init as initHsd,
} from "@helium/helium-sub-daos-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { headers } from "next/headers";
import {
  createRateLimiter,
  getClientIp,
  parseRateLimit,
} from "@/lib/utils/rate-limit";
import { getLockupKind } from "../helpers/constants";
import {
  fetchEpochInfos,
  fetchRegistrarsByKey,
  getClaimableEpochRange,
  getPositionsForOwner,
  isEpochInfoIssued,
  summarizeClaimableEpochs,
} from "../helpers";
import type {
  ClaimableEpochRange,
  HsdProgram,
  OwnedPosition,
} from "../helpers";

// Courtesy throttle (per-process, XFF-keyed) on a public endpoint whose cost
// is server-side RPC fan-out.
const getPositionsIpRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: () => parseRateLimit(process.env.GET_POSITIONS_RATE_LIMIT_PER_IP, 60),
});

type DelegatedPositionV0 = Awaited<
  ReturnType<HsdProgram["account"]["delegatedPositionV0"]["fetch"]>
>;

/**
 * Delegation output for every owned position, using the same epoch range and
 * issuance test as buildClaimInstructions so the counts match what a claim or
 * undelegate call would actually do.
 */
const fetchDelegations = async ({
  connection,
  hsdProgram,
  owned,
}: {
  connection: Awaited<ReturnType<typeof createSolanaConnection>>["connection"];
  hsdProgram: HsdProgram;
  owned: OwnedPosition[];
}) => {
  const dao = daoKey(HNT_MINT)[0];
  const delegated: (DelegatedPositionV0 | null)[] =
    await hsdProgram.account.delegatedPositionV0.fetchMultiple(
      owned.map((p) => delegatedPositionKey(p.position)[0]),
    );
  if (delegated.every((d) => !d)) {
    return owned.map(() => null);
  }

  const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const unixNow = Number(clock!.data.readBigInt64LE(8 * 4));

  const ranges: (ClaimableEpochRange | null)[] = owned.map((p, i) => {
    const delegation = delegated[i];
    if (!delegation) return null;
    return getClaimableEpochRange({
      lockup: p.account.lockup,
      delegatedPosition: delegation,
      unixNow,
    });
  });

  // Positions on the same sub-DAO share sub-DAO epoch infos, and every
  // position shares the DAO epoch infos; read each once.
  const entries: { subDao: PublicKey; epoch: number }[] = [];
  ranges.forEach((range, i) => {
    if (!range) return;
    const subDao = delegated[i]!.subDao;
    for (const epoch of range.unclaimedEpochs) {
      entries.push({ subDao, epoch });
    }
  });

  const infos = await fetchEpochInfos({
    connection,
    hsdProgram,
    dao,
    entries,
  });
  const issued = new Set(
    entries
      .filter((_, i) => isEpochInfoIssued(infos[i]))
      .map(({ subDao, epoch }) => `${subDao.toBase58()}:${epoch}`),
  );

  return ranges.map((range, i) => {
    const delegation = delegated[i];
    if (!range || !delegation) return null;
    const { subDao } = delegation;
    return {
      subDao: subDao.toBase58(),
      lastClaimedEpoch: delegation.lastClaimedEpoch.toNumber(),
      expirationTs: delegation.expirationTs.toNumber(),
      ...summarizeClaimableEpochs(range, (epoch) =>
        issued.has(`${subDao.toBase58()}:${epoch}`),
      ),
    };
  });
};

export const getPositions = publicProcedure.governance.getPositions.handler(
  async ({ input, errors }) => {
    const { wallet } = input;

    if (!getPositionsIpRateLimiter(getClientIp(await headers()))) {
      throw errors.RATE_LIMITED();
    }
    const walletPubkey = new PublicKey(wallet);

    const { connection, provider } = createSolanaConnection(wallet);
    const [vsrProgram, hsdProgram] = await Promise.all([
      initVsr(provider),
      initHsd(provider),
    ]);

    const owned = await getPositionsForOwner({
      connection,
      vsrProgram,
      owner: walletPubkey,
    });
    if (owned.length === 0) return [];

    // Registrars are shared across positions — fetch each unique one once.
    const [registrarByKey, delegations] = await Promise.all([
      fetchRegistrarsByKey(vsrProgram, owned),
      fetchDelegations({ connection, hsdProgram, owned }),
    ]);

    const positions = await Promise.all(
      owned.map(async ({ mint, position, account: acc }, i) => {
        const registrar = registrarByKey.get(acc.registrar.toBase58());
        // An out-of-range votingMintConfigIdx (corrupt/nonstandard registrar
        // data) must drop the position, not 500 the whole response.
        const votingMintConfig =
          registrar?.votingMints[acc.votingMintConfigIdx];
        if (!votingMintConfig) return null;

        const votingMint = votingMintConfig.mint.toBase58();

        return {
          positionMint: mint.toBase58(),
          position: position.toBase58(),
          registrar: acc.registrar.toBase58(),
          amountDeposited: await toTokenAmountOutput(
            acc.amountDepositedNative,
            votingMint,
          ),
          numActiveVotes: acc.numActiveVotes,
          lockup: {
            kind: getLockupKind(acc.lockup),
            startTs: acc.lockup.startTs.toString(),
            endTs: acc.lockup.endTs.toString(),
          },
          delegation: delegations[i],
        };
      }),
    );

    return positions.filter((p) => p !== null);
  },
);
