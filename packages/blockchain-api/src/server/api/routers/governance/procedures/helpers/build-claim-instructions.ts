import {
  daoEpochInfoKey,
  daoKey,
  EPOCH_LENGTH,
  init as initHsd,
  subDaoEpochInfoKey,
} from "@helium/helium-sub-daos-sdk";
import {
  accountWindowedBreakerKey,
  PROGRAM_ID as CIRCUIT_BREAKER_PROGRAM_ID,
} from "@helium/circuit-breaker-sdk";
import { chunks, HNT_MINT, truthy } from "@helium/spl-utils";
import {
  isClaimed,
  PROGRAM_ID as VSR_PROGRAM_ID,
} from "@helium/voter-stake-registry-sdk";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { getLockupKind, MAX_TXS_PER_CALL } from "./constants";

type HsdProgram = Awaited<ReturnType<typeof initHsd>>;

const DAO = daoKey(HNT_MINT)[0];
const EPOCHS_PER_BATCH = 128;

// Epochs at or after the delegation's expiration pay zero rewards and
// close_delegation_v0 no longer requires claiming them. The epoch containing
// expiration_ts still pays, so the exclusive end-epoch bound is
// epoch(expiration - 1) + 1. An expirationTs of 0 means no expiration.
export const expirationCapEpoch = (expirationTs: BN): number =>
  expirationTs.isZero()
    ? Number.MAX_SAFE_INTEGER
    : expirationTs.sub(new BN(1)).div(new BN(EPOCH_LENGTH)).toNumber() + 1;

interface PositionInfo {
  mint: PublicKey;
  pubkey: PublicKey;
  account: {
    lockup: {
      kind: object;
      endTs: BN;
    };
    registrar: PublicKey;
  };
  delegatedPositionKey: PublicKey;
  delegatedPosition: {
    subDao: PublicKey;
    lastClaimedEpoch: BN;
    claimedEpochsBitmap: BN;
    expirationTs: BN;
  };
}

export interface ClaimInstructionsResult {
  instructionBatches: TransactionInstruction[][];
  hasMore: boolean;
  hasRewards: boolean;
  rewardMints: PublicKey[];
  /**
   * Epochs that closeDelegationV0 requires claimed but whose rewards have not
   * been issued yet. The program asserts last_claimed_epoch >= curr_epoch - 1
   * (capped by lockup end / expiration) and panics otherwise, so a close built
   * while this is non-empty will fail on-chain.
   */
  unclaimableEpochs: { positionMint: PublicKey; epoch: number }[];
}

export interface BuildClaimInstructionsParams {
  positions: PositionInfo[];
  walletPubkey: PublicKey;
  connection: Connection;
  hsdProgram: HsdProgram;
}

// getMultipleAccounts caps out at 100 keys per call, so anything longer is
// split. The splits are independent reads, so they go out together: a claim
// spanning five batches of 128 epochs is 10 round trips, and awaiting them one
// at a time costs ten times a single round trip in request latency.
export async function getMultipleAccounts(
  connection: Connection,
  keys: PublicKey[],
): Promise<(Awaited<ReturnType<Connection["getAccountInfo"]>> | null)[]> {
  const batches = await Promise.all(
    chunks(keys, 100).map((batchKeys) =>
      connection.getMultipleAccountsInfo(batchKeys),
    ),
  );

  return batches.flat();
}

export async function buildClaimInstructions(
  params: BuildClaimInstructionsParams,
): Promise<ClaimInstructionsResult> {
  const { positions, walletPubkey, connection, hsdProgram } = params;

  const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const unixNow = Number(clock!.data.readBigInt64LE(8 * 4));
  const currentEpoch = new BN(unixNow).div(new BN(EPOCH_LENGTH));

  const subDaoKeys = new Set(
    positions.map((p) => p.delegatedPosition.subDao.toBase58()),
  );

  type SubDaoAccount = Awaited<
    ReturnType<typeof hsdProgram.account.subDaoV0.fetch>
  >;
  const subDaoEntries = await Promise.all(
    [...subDaoKeys].map(
      async (key): Promise<[string, SubDaoAccount]> => [
        key,
        await hsdProgram.account.subDaoV0.fetch(new PublicKey(key)),
      ],
    ),
  );
  const subDaos: Record<string, SubDaoAccount> =
    Object.fromEntries(subDaoEntries);

  const firstSubDao = Object.values(subDaos)[0];
  const daoAcc = await hsdProgram.account.daoV0.fetch(firstSubDao.dao);

  type EpochToClaim = {
    position: PositionInfo;
    epoch: BN;
    subDao: PublicKey;
    subDaoAcc: SubDaoAccount;
    requiredForClose: boolean;
  };

  const maxEpochsThisCall = MAX_TXS_PER_CALL * EPOCHS_PER_BATCH;
  const allEpochsToClaim: EpochToClaim[] = [];
  let hitCap = false;

  for (const position of positions) {
    if (hitCap) break;

    const { lockup } = position.account;
    const lockupKind = getLockupKind(lockup);
    const isConstant = lockupKind === "constant";
    const isDecayed = !isConstant && lockup.endTs.lte(new BN(unixNow));
    const decayedEpoch = lockup.endTs.div(new BN(EPOCH_LENGTH));
    // Mirrors to_claim_to_epoch in close_delegation_v0.rs
    const isCliff = lockupKind === "cliff";
    const closeRequiresThroughEpoch = Math.min(
      isDecayed && isCliff
        ? decayedEpoch.toNumber() - 1
        : currentEpoch.toNumber() - 1,
      expirationCapEpoch(position.delegatedPosition.expirationTs) - 1,
    );

    const subDao = position.delegatedPosition.subDao;
    const subDaoAcc = subDaos[subDao.toBase58()];

    const { lastClaimedEpoch, claimedEpochsBitmap, expirationTs } =
      position.delegatedPosition;
    const startEpoch = lastClaimedEpoch.add(new BN(1));
    const bitmapWindowEnd = lastClaimedEpoch.add(new BN(129)).toNumber();
    const rawEndEpoch = Math.min(
      isDecayed
        ? decayedEpoch.add(new BN(1)).toNumber()
        : currentEpoch.toNumber(),
      expirationCapEpoch(expirationTs),
    );
    const endEpoch = Math.min(rawEndEpoch, bitmapWindowEnd);

    if (rawEndEpoch > bitmapWindowEnd) {
      hitCap = true;
    }

    for (let e = startEpoch.toNumber(); e < endEpoch; e++) {
      if (allEpochsToClaim.length >= maxEpochsThisCall) {
        hitCap = true;
        break;
      }

      if (
        !isClaimed({
          epoch: e,
          lastClaimedEpoch: lastClaimedEpoch.toNumber(),
          claimedEpochsBitmap,
        })
      ) {
        allEpochsToClaim.push({
          position,
          epoch: new BN(e),
          subDao,
          subDaoAcc,
          requiredForClose: e <= closeRequiresThroughEpoch,
        });
      }
    }
  }

  if (allEpochsToClaim.length === 0) {
    return {
      instructionBatches: [],
      hasMore: false,
      hasRewards: false,
      rewardMints: [],
      unclaimableEpochs: [],
    };
  }

  const rewardMintSet = new Set<string>();

  // One batch's epoch infos do not depend on any other batch's, so every
  // batch's reads go out at once rather than end to end: a multi-batch claim
  // spends most of its time in these round trips.
  const builtChunks = await Promise.all(
    chunks(allEpochsToClaim, EPOCHS_PER_BATCH).map(async (chunk) => {
      const unclaimableEpochs: ClaimInstructionsResult["unclaimableEpochs"] =
        [];
      const subDaoEpochInfoKeys = chunk.map(
        ({ epoch, subDao }) =>
          subDaoEpochInfoKey(subDao, epoch.mul(new BN(EPOCH_LENGTH)))[0],
      );
      const subDaoEpochInfoAccounts = await getMultipleAccounts(
        connection,
        subDaoEpochInfoKeys,
      );

      const batchInstructions = await Promise.all(
        chunk.map(
          async (
            { position, epoch, subDao, subDaoAcc, requiredForClose },
            index,
          ) => {
            const subDaoEpochInfoAccount = subDaoEpochInfoAccounts[index];
            const subDaoEpochInfoData = subDaoEpochInfoAccount
              ? hsdProgram.coder.accounts.decode(
                  "subDaoEpochInfoV0",
                  subDaoEpochInfoAccount.data,
                )
              : null;

            if (!subDaoEpochInfoData?.rewardsIssuedAt) {
              if (requiredForClose) {
                unclaimableEpochs.push({
                  positionMint: position.mint,
                  epoch: epoch.toNumber(),
                });
              }
              return null;
            }

            const commonAccounts = {
              position: position.pubkey,
              mint: position.mint,
              positionTokenAccount: getAssociatedTokenAddressSync(
                position.mint,
                walletPubkey,
                true,
              ),
              positionAuthority: walletPubkey,
              registrar: position.account.registrar,
              dao: DAO,
              subDao,
              delegatedPosition: position.delegatedPositionKey,
              vsrProgram: VSR_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
              circuitBreakerProgram: CIRCUIT_BREAKER_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              tokenProgram: TOKEN_PROGRAM_ID,
            };

            if (subDaoEpochInfoData.hntRewardsIssued.gt(new BN(0))) {
              rewardMintSet.add(daoAcc.hntMint.toBase58());
              return hsdProgram.methods
                .claimRewardsV1({ epoch })
                .accountsStrict({
                  ...commonAccounts,
                  payer: walletPubkey,
                  hntMint: daoAcc.hntMint,
                  daoEpochInfo: daoEpochInfoKey(
                    subDaoAcc.dao,
                    epoch.mul(new BN(EPOCH_LENGTH)),
                  )[0],
                  delegatorPool: daoAcc.delegatorPool,
                  delegatorAta: getAssociatedTokenAddressSync(
                    daoAcc.hntMint,
                    walletPubkey,
                    true,
                  ),
                  delegatorPoolCircuitBreaker: accountWindowedBreakerKey(
                    daoAcc.delegatorPool,
                  )[0],
                })
                .instruction();
            } else {
              rewardMintSet.add(subDaoAcc.dntMint.toBase58());
              return hsdProgram.methods
                .claimRewardsV0({ epoch })
                .accountsStrict({
                  ...commonAccounts,
                  dntMint: subDaoAcc.dntMint,
                  subDaoEpochInfo: subDaoEpochInfoKey(
                    subDao,
                    epoch.mul(new BN(EPOCH_LENGTH)),
                  )[0],
                  delegatorPool: subDaoAcc.delegatorPool,
                  delegatorAta: getAssociatedTokenAddressSync(
                    subDaoAcc.dntMint,
                    walletPubkey,
                    true,
                  ),
                  delegatorPoolCircuitBreaker: accountWindowedBreakerKey(
                    subDaoAcc.delegatorPool,
                  )[0],
                })
                .instruction();
            }
          },
        ),
      );

      return {
        instructions: batchInstructions.filter(truthy),
        unclaimableEpochs,
      };
    }),
  );

  const allInstructionBatches = builtChunks
    .map(({ instructions }) => instructions)
    .filter((instructions) => instructions.length > 0);

  return {
    instructionBatches: allInstructionBatches,
    hasMore: hitCap,
    hasRewards: allInstructionBatches.length > 0,
    rewardMints: [...rewardMintSet].map((m) => new PublicKey(m)),
    unclaimableEpochs: builtChunks.flatMap(
      ({ unclaimableEpochs }) => unclaimableEpochs,
    ),
  };
}
