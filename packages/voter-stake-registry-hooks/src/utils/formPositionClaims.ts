import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import {
  PROGRAM_ID as CIRCUIT_BREAKER_PROGRAM_ID,
  accountWindowedBreakerKey,
} from "@helium/circuit-breaker-sdk";
import {
  EPOCH_LENGTH,
  PROGRAM_ID as HSD_PROGRAM_ID,
  daoEpochInfoKey,
  daoKey,
  delegatedPositionKey,
  init,
  subDaoEpochInfoKey,
} from "@helium/helium-sub-daos-sdk";
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
  AccountInfo,
  Connection,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
import { PositionWithMeta, SubDao } from "../sdk/types";
import { createClaimWindow } from "./claimWindow";

const DAO = daoKey(HNT_MINT)[0];

export const formPositionClaims = async ({
  provider,
  positions,
  hsdProgramId = HSD_PROGRAM_ID,
}: {
  provider: AnchorProvider;
  positions: PositionWithMeta[];
  hsdProgramId: PublicKey;
}): Promise<TransactionInstruction[][]> => {
  const instructions: TransactionInstruction[][] = [];
  const hsdIdl = await fetchBackwardsCompatibleIdl(
    hsdProgramId,
    provider as any
  );
  const hsdProgram = await init(provider as any, hsdProgramId, hsdIdl);
  const connNoCache = new Connection(provider.connection.rpcEndpoint);
  const clock = await connNoCache.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const unixNow = Number(clock?.data.readBigInt64LE(8 * 4));
  const isInvalid = !unixNow || !positions.some((pos) => pos.hasRewards);

  if (positions.length === 0) {
    return [];
  }

  if (isInvalid || !hsdProgram) {
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

    const subDaoKeys = new Set([
      ...delegatedPositions
        .map((p) => p.account?.subDao.toBase58())
        .filter(truthy),
    ]);

    if (subDaoKeys.size === 0) {
      return [];
    }

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
    const daoAcc = await hsdProgram.account.daoV0.fetch(
      Object.values(subDaos)[0].dao
    );

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
        // claim_rewards_v1 fails EpochNotOver for the current epoch, so the
        // last claimable epoch is the one before it.
        const lastEpoch = isDecayed
          ? BN.min(decayedEpoch, currentEpoch.sub(new BN(1)))
          : currentEpoch.sub(new BN(1));
        const epochsCount = lastEpoch.sub(epoch).add(new BN(1)).toNumber();

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

        const claimWindow = createClaimWindow();

        // Chunk size is 128 because we want each chunk to correspond to the 128 bits in bitmap
        for (const chunk of chunks(epochsToClaim, 128)) {
          const subDaoEpochInfoKeys = chunk.map(
            (epoch) =>
              subDaoEpochInfoKey(subDao, epoch.mul(new BN(EPOCH_LENGTH)))[0]
          );
          const subDaoEpochInfoAccounts = await getMultipleAccounts({
            connection: connNoCache,
            keys: subDaoEpochInfoKeys,
          });
          const daoEpochInfoAccounts = await getMultipleAccounts({
            connection: connNoCache,
            keys: chunk.map(
              (epoch) =>
                daoEpochInfoKey(subDaoAcc.dao, epoch.mul(new BN(EPOCH_LENGTH)))[0]
            ),
          });
          const chunkInstructions = (
            await Promise.all(
              chunk.map((epoch, index) => {
                let hntRewardsIssued = false;
                const decision = claimWindow.decide(epoch.toNumber(), () => {
                  const subDaoEpochInfoAccount = subDaoEpochInfoAccounts[index];
                  if (!subDaoEpochInfoAccount)
                    return { subDaoEpochInfo: null, daoEpochInfo: null };
                  const subDaoEpochInfoData = hsdProgram.coder.accounts.decode(
                    "subDaoEpochInfoV0",
                    subDaoEpochInfoAccount.data
                  );
                  hntRewardsIssued = subDaoEpochInfoData.hntRewardsIssued.gt(
                    new BN(0)
                  );
                  const daoEpochInfoAccount = daoEpochInfoAccounts[index];
                  const daoEpochInfoData =
                    subDaoEpochInfoData.rewardsIssuedAt &&
                    hntRewardsIssued &&
                    daoEpochInfoAccount
                      ? hsdProgram.coder.accounts.decode(
                          "daoEpochInfoV0",
                          daoEpochInfoAccount.data
                        )
                      : null;
                  return {
                    subDaoEpochInfo: {
                      rewardsIssued: !!subDaoEpochInfoData.rewardsIssuedAt,
                      hntRewardsIssued,
                    },
                    daoEpochInfo: daoEpochInfoData && {
                      doneIssuingRewards: !!daoEpochInfoData.doneIssuingRewards,
                      delegationRewardsIssued:
                        !daoEpochInfoData.delegationRewardsIssued.isZero(),
                    },
                  };
                });
                if (decision !== "claim") return null;

                if (hntRewardsIssued) {
                  return hsdProgram.methods
                    .claimRewardsV1({
                      epoch,
                    })
                    .accountsStrict({
                      payer: provider.wallet.publicKey,
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
                      hntMint: daoAcc.hntMint,
                      daoEpochInfo: daoEpochInfoKey(
                        subDaoAcc.dao,
                        epoch.mul(new BN(EPOCH_LENGTH))
                      )[0],
                      delegatorPool: daoAcc.delegatorPool,
                      delegatorAta: getAssociatedTokenAddressSync(
                        daoAcc.hntMint,
                        provider.wallet.publicKey
                      ),
                      delegatorPoolCircuitBreaker: accountWindowedBreakerKey(
                        daoAcc.delegatorPool
                      )[0],
                      vsrProgram: VSR_PROGRAM_ID,
                      systemProgram: SystemProgram.programId,
                      circuitBreakerProgram: CIRCUIT_BREAKER_PROGRAM_ID,
                      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                      tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .instruction();
                } else {
                  return hsdProgram.methods
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
                    .instruction();
                }
              })
            )
          ).filter(truthy);
          if (chunkInstructions.length > 0) {
            bucketedEpochsByPosition[position.pubkey.toBase58()].push(
              chunkInstructions
            );
          }
        }
        const { skipped: skippedEpochs, dropped: droppedEpochs } = claimWindow;
        if (skippedEpochs.length > 0) {
          const skipped = skippedEpochs
            .map(({ epoch, reason }) => `${epoch} ${reason}`)
            .join(", ");
          const dropped =
            droppedEpochs.length > 0
              ? `; dropped epochs [${droppedEpochs.join(
                  ", "
                )}] past the claim window`
              : "";
          console.warn(
            `formPositionClaims: position ${position.pubkey.toBase58()} skipped epochs [${skipped}]; last_claimed_epoch stops at the first one${dropped}`
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

  return instructions.filter(truthy);
};

async function getMultipleAccounts({
  connection,
  keys,
}: {
  connection: Connection;
  keys: PublicKey[];
}): Promise<(AccountInfo<Buffer> | null)[]> {
  const batchSize = 100;
  const batches = Math.ceil(keys.length / batchSize);
  const results: (AccountInfo<Buffer> | null)[] = [];

  for (let i = 0; i < batches; i++) {
    const batchKeys = keys.slice(i * batchSize, (i + 1) * batchSize);
    const batchResults = await connection.getMultipleAccountsInfo(batchKeys);
    results.push(...batchResults);
  }

  return results;
}
