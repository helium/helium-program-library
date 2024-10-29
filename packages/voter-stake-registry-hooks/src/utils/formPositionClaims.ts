import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  PROGRAM_ID as CIRCUIT_BREAKER_PROGRAM_ID,
  accountWindowedBreakerKey,
} from "@helium/circuit-breaker-sdk";
import {
  EPOCH_LENGTH,
  PROGRAM_ID as HSD_PROGRAM_ID,
  daoKey,
  delegatedPositionKey,
  init,
  subDaoEpochInfoKey,
} from "@helium/helium-sub-daos-sdk";
import {
  PROGRAM_ID as PVR_PROGRAM_ID,
  enrolledPositionKey,
  init as initPvr,
  vsrEpochInfoKey,
} from "@helium/position-voting-rewards-sdk";
import { HNT_MINT, chunks, truthy } from "@helium/spl-utils";
import {
  PROGRAM_ID as VSR_PROGRAM_ID,
  isClaimed,
} from "@helium/voter-stake-registry-sdk";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { PositionWithMeta, SubDao, VeTokenTracker } from "../sdk/types";

const DAO = daoKey(HNT_MINT)[0];

export const formPositionClaims = async ({
  provider,
  positions,
  hsdProgramId = HSD_PROGRAM_ID,
  pvrProgramId = PVR_PROGRAM_ID,
}: {
  provider: AnchorProvider;
  positions: PositionWithMeta[];
  hsdProgramId: PublicKey;
  pvrProgramId: PublicKey;
}): Promise<TransactionInstruction[][]> => {
  const instructions: TransactionInstruction[][] = [];
  const hsdIdl = await Program.fetchIdl(hsdProgramId, provider);
  const pvrIdl = await Program.fetchIdl(pvrProgramId, provider);
  const hsdProgram = await init(provider as any, hsdProgramId, hsdIdl);
  const pvrProgram = await initPvr(provider as any, pvrProgramId, pvrIdl);
  const connNoCache = new Connection(provider.connection.rpcEndpoint);
  const clock = await connNoCache.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const unixNow = Number(clock?.data.readBigInt64LE(8 * 4));
  const isInvalid = !unixNow || !positions.every((pos) => pos.hasRewards);

  if (isInvalid || !hsdProgram || !pvrProgram) {
    throw new Error("Unable to form position claims, Invalid params");
  } else {
    const currentEpoch = new BN(unixNow).div(new BN(EPOCH_LENGTH));
    const bucketedEpochsByPosition: Record<string, TransactionInstruction[][]> =
      {};

    const delegatedPositions = await Promise.all(
      positions.map(async (p) => {
        const key = delegatedPositionKey(p.pubkey)[0];
        return {
          key,
          account: await hsdProgram.account.delegatedPositionV0.fetchNullable(
            key
          ),
        };
      })
    );

    const enrolledPositions = await Promise.all(
      positions.map(async (p) => {
        const key = enrolledPositionKey(p.pubkey)[0];
        return {
          key,
          account: await pvrProgram.account.enrolledPositionV0.fetchNullable(
            key
          ),
        };
      })
    );

    const subDaoKeys = new Set([
      ...delegatedPositions
        .map((p) => p.account?.subDao.toBase58())
        .filter(truthy),
    ]);

    const subDaos = (
      await Promise.all(
        [...subDaoKeys].map(async (sd) => ({
          key: sd,
          account: await hsdProgram.account.subDaoV0.fetch(sd),
        }))
      )
    ).reduce((acc, { key, account }) => {
      if (key) {
        acc[key] = account;
      }
      return acc;
    }, {} as Record<string, SubDao>);

    const vetokenTrackerKeys = new Set([
      ...enrolledPositions
        .map((p) => p.account?.vetokenTracker.toBase58())
        .filter(truthy),
    ]);

    const vetokenTrackers = (
      await Promise.all(
        [...vetokenTrackerKeys].map(async (vt) => ({
          key: vt,
          account: await pvrProgram.account.veTokenTrackerV0.fetch(vt),
        }))
      )
    ).reduce((acc, { key, account }) => {
      if (key) {
        acc[key] = account;
      }
      return acc;
    }, {} as Record<string, VeTokenTracker>);

    for (const [idx, position] of positions.entries()) {
      bucketedEpochsByPosition[position.pubkey.toBase58()] =
        bucketedEpochsByPosition[position.pubkey.toBase58()] || [];

      const delegatedPosition = delegatedPositions[idx];
      const { lockup } = position;
      const lockupKind = Object.keys(lockup.kind)[0] as string;
      const isConstant = lockupKind === "constant";
      const isDecayed = !isConstant && lockup.endTs.lte(new BN(unixNow));
      const decayedEpoch = lockup.endTs.div(new BN(EPOCH_LENGTH));

      if (delegatedPosition?.account) {
        const subDao = delegatedPosition.account.subDao;
        const subDaoStr = subDao.toBase58();
        const subDaoAcc = subDaos[subDaoStr];

        const { lastClaimedEpoch, claimedEpochsBitmap } =
          delegatedPosition.account;
        const epoch = lastClaimedEpoch.add(new BN(1));
        const epochsCount = isDecayed
          ? decayedEpoch.sub(epoch).add(new BN(1)).toNumber()
          : currentEpoch.sub(epoch).toNumber();

        const epochsToClaim = Array.from(
          { length: epochsCount > 0 ? epochsCount : 0 },
          (_v, k) => epoch.addn(k)
        ).filter(
          (epoch) =>
            !isClaimed({
              epoch: epoch.toNumber(),
              lastClaimedEpoch: lastClaimedEpoch.toNumber(),
              claimedEpochsBitmap,
            })
        );

        // Chunk size is 128 because we want each chunk to correspond to the 128 bits in bitmap
        for (const chunk of chunks(epochsToClaim, 128)) {
          bucketedEpochsByPosition[position.pubkey.toBase58()].push(
            await Promise.all(
              chunk.map((epoch) =>
                hsdProgram.methods
                  .claimRewardsV0({
                    epoch,
                  })
                  .accountsStrict({
                    position: position.pubkey,
                    mint: position.mint,
                    positionTokenAccount: getAssociatedTokenAddressSync(
                      position.mint,
                      provider.wallet.publicKey
                    ),
                    positionAuthority: provider.wallet.publicKey,
                    registrar: position.registrar,
                    dao: DAO,
                    subDao: delegatedPosition.account!.subDao,
                    delegatedPosition: delegatedPosition.key,
                    dntMint: subDaoAcc.dntMint,
                    subDaoEpochInfo: subDaoEpochInfoKey(
                      subDao,
                      epoch.mul(new BN(EPOCH_LENGTH))
                    )[0],
                    delegatorPool: subDaoAcc.delegatorPool,
                    delegatorAta: getAssociatedTokenAddressSync(
                      subDaoAcc.dntMint,
                      provider.wallet.publicKey
                    ),
                    delegatorPoolCircuitBreaker: accountWindowedBreakerKey(
                      subDaoAcc.delegatorPool
                    )[0],
                    vsrProgram: VSR_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    circuitBreakerProgram: CIRCUIT_BREAKER_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                  })
                  .instruction()
              )
            )
          );
        }
      }

      const enrolledPosition = enrolledPositions[idx];
      if (enrolledPosition?.account) {
        const { lastClaimedEpoch, claimedEpochsBitmap } =
          enrolledPosition.account;
        const epoch = lastClaimedEpoch.add(new BN(1));
        const epochsCount = isDecayed
          ? decayedEpoch.sub(epoch).add(new BN(1)).toNumber()
          : currentEpoch.sub(epoch).toNumber();

        const epochsToClaim = Array.from(
          { length: epochsCount > 0 ? epochsCount : 0 },
          (_v, k) => epoch.addn(k)
        ).filter(
          (epoch) =>
            !isClaimed({
              epoch: epoch.toNumber(),
              lastClaimedEpoch: lastClaimedEpoch.toNumber(),
              claimedEpochsBitmap,
            })
        );

        const vetokenTracker = enrolledPosition.account.vetokenTracker;
        const vetokenTrackerStr = vetokenTracker.toBase58();
        const vetokenTrackerAcc = vetokenTrackers[vetokenTrackerStr];

        // Chunk size is 128 because we want each chunk to correspond to the 128 bits in bitmap
        for (const chunk of chunks(epochsToClaim, 128)) {
          const vsrEpochInfo = vsrEpochInfoKey(
            vetokenTracker,
            epoch.mul(new BN(EPOCH_LENGTH))
          )[0];
          const rewardsPool = getAssociatedTokenAddressSync(
            vetokenTrackerAcc.rewardsMint,
            vsrEpochInfo,
            true
          );
          bucketedEpochsByPosition[position.pubkey.toBase58()].push(
            await Promise.all(
              chunk.map((epoch) =>
                pvrProgram.methods
                  .claimRewardsV0({
                    epoch,
                  })
                  .accountsStrict({
                    position: position.pubkey,
                    mint: position.mint,
                    positionTokenAccount: getAssociatedTokenAddressSync(
                      position.mint,
                      provider.wallet.publicKey
                    ),
                    positionAuthority: provider.wallet.publicKey,
                    registrar: position.registrar,
                    vetokenTracker: enrolledPosition.account!.vetokenTracker,
                    enrolledPosition: enrolledPosition.key,
                    rewardsMint: vetokenTrackerAcc.rewardsMint,
                    vsrEpochInfo,
                    rewardsPool,
                    enrolledAta: getAssociatedTokenAddressSync(
                      vetokenTrackerAcc.rewardsMint,
                      provider.wallet.publicKey
                    ),
                    vsrProgram: VSR_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                  })
                  .instruction()
              )
            )
          );
        }
      }
    }

    instructions.push(
      ...Object.entries(bucketedEpochsByPosition).reduce(
        (acc, [_, instructions]) => {
          instructions.map((ixs, idx) => {
            acc[idx] = acc[idx] || [];
            acc[idx].push(...ixs);
          });
          return acc;
        },
        [] as TransactionInstruction[][]
      )
    );
  }

  return instructions;
};
