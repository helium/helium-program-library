import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection } from "@/lib/solana";
import { getMultipleAccounts } from "@/lib/utils/get-multiple-accounts";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  daoEpochInfoKey,
  daoKey,
  delegatedPositionKey,
  EPOCH_LENGTH,
  init as initHsd,
  subDaoEpochInfoKey,
} from "@helium/helium-sub-daos-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import BN from "bn.js";
import { headers } from "next/headers";
import {
  createRateLimiter,
  getClientIp,
  parseRateLimit,
} from "@/lib/utils/rate-limit";
import { getLockupKind } from "../helpers/constants";
import {
  fetchRegistrarsByKey,
  getClaimableEpochRange,
  getPositionsForOwner,
  isEpochInfoIssued,
  summarizeClaimableEpochs,
} from "../helpers";
import type { ClaimableEpochRange, OwnedPosition } from "../helpers";

// Courtesy throttle (per-process, XFF-keyed) on a public endpoint whose cost
// is server-side RPC fan-out.
const getPositionsIpRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: () => parseRateLimit(process.env.GET_POSITIONS_RATE_LIMIT_PER_IP, 60),
});

type HsdProgram = Awaited<ReturnType<typeof initHsd>>;
type DelegatedPositionV0 = Awaited<
  ReturnType<HsdProgram["account"]["delegatedPositionV0"]["fetch"]>
>;

const epochInfoId = (subDao: PublicKey, epoch: number) =>
  `${subDao.toBase58()}:${epoch}`;

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
      owned.map((p) => delegatedPositionKey(p.position)[0])
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
  const epochInfoKeys = new Map<string, PublicKey>();
  const daoEpochInfoKeys = new Map<number, PublicKey>();
  ranges.forEach((range, i) => {
    if (!range) return;
    const subDao = delegated[i]!.subDao;
    for (const epoch of range.unclaimedEpochs) {
      const epochTs = new BN(epoch).mul(new BN(EPOCH_LENGTH));
      const id = epochInfoId(subDao, epoch);
      if (!epochInfoKeys.has(id)) {
        epochInfoKeys.set(id, subDaoEpochInfoKey(subDao, epochTs)[0]);
      }
      if (!daoEpochInfoKeys.has(epoch)) {
        daoEpochInfoKeys.set(epoch, daoEpochInfoKey(dao, epochTs)[0]);
      }
    }
  });

  const ids = [...epochInfoKeys.keys()];
  const epochs = [...daoEpochInfoKeys.keys()];
  const [infos, daoInfos] = await Promise.all([
    getMultipleAccounts(
      connection,
      ids.map((id) => epochInfoKeys.get(id)!)
    ),
    getMultipleAccounts(
      connection,
      epochs.map((epoch) => daoEpochInfoKeys.get(epoch)!)
    ),
  ]);
  const daoEpochInfoByEpoch = new Map<
    number,
    Awaited<ReturnType<HsdProgram["account"]["daoEpochInfoV0"]["fetch"]>> | null
  >(
    epochs.map((epoch, i) => {
      const info = daoInfos[i];
      return [
        epoch,
        info
          ? hsdProgram.coder.accounts.decode("daoEpochInfoV0", info.data)
          : null,
      ];
    })
  );
  const issued = new Set(
    ids.filter((id, i) => {
      const info = infos[i];
      if (!info) return false;
      const epoch = Number(id.split(":")[1]);
      return isEpochInfoIssued({
        subDaoEpochInfo: hsdProgram.coder.accounts.decode(
          "subDaoEpochInfoV0",
          info.data
        ),
        daoEpochInfo: daoEpochInfoByEpoch.get(epoch),
      });
    })
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
        issued.has(epochInfoId(subDao, epoch))
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
            votingMint
          ),
          numActiveVotes: acc.numActiveVotes,
          lockup: {
            kind: getLockupKind(acc.lockup),
            startTs: acc.lockup.startTs.toString(),
            endTs: acc.lockup.endTs.toString(),
          },
          delegation: delegations[i],
        };
      })
    );

    return positions.filter((p) => p !== null);
  }
);
