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
  };
}

export interface ClaimInstructionsResult {
  instructionBatches: TransactionInstruction[][];
  hasMore: boolean;
  hasRewards: boolean;
  rewardMints: PublicKey[];
}

export interface BuildClaimInstructionsParams {
  positions: PositionInfo[];
  walletPubkey: PublicKey;
  connection: Connection;
  hsdProgram: HsdProgram;
}

async function getMultipleAccounts(
  connection: Connection,
  keys: PublicKey[],
): Promise<(Awaited<ReturnType<Connection["getAccountInfo"]>> | null)[]> {
  const batchSize = 100;
  const batches = Math.ceil(keys.length / batchSize);
  const results: (Awaited<ReturnType<Connection["getAccountInfo"]>> | null)[] =
    [];

  for (let i = 0; i < batches; i++) {
    const batchKeys = keys.slice(i * batchSize, (i + 1) * batchSize);
    const batchResults = await connection.getMultipleAccountsInfo(batchKeys);
    results.push(...batchResults);
  }

  return results;
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

    const subDao = position.delegatedPosition.subDao;
    const subDaoAcc = subDaos[subDao.toBase58()];

    const { lastClaimedEpoch, claimedEpochsBitmap } =
      position.delegatedPosition;
    const startEpoch = lastClaimedEpoch.add(new BN(1));
    const bitmapWindowEnd = lastClaimedEpoch.add(new BN(129)).toNumber();
    const rawEndEpoch = isDecayed
      ? decayedEpoch.add(new BN(1)).toNumber()
      : currentEpoch.sub(new BN(1)).toNumber();
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
    };
  }

  const allInstructionBatches: TransactionInstruction[][] = [];
  const rewardMintSet = new Set<string>();

  for (const chunk of chunks(allEpochsToClaim, EPOCHS_PER_BATCH)) {
    const subDaoEpochInfoKeys = chunk.map(
      ({ epoch, subDao }) =>
        subDaoEpochInfoKey(subDao, epoch.mul(new BN(EPOCH_LENGTH)))[0],
    );
    const subDaoEpochInfoAccounts = await getMultipleAccounts(
      connection,
      subDaoEpochInfoKeys,
    );

    const batchInstructions = await Promise.all(
      chunk.map(async ({ position, epoch, subDao, subDaoAcc }, index) => {
        const subDaoEpochInfoAccount = subDaoEpochInfoAccounts[index];
        if (!subDaoEpochInfoAccount) return null;

        const subDaoEpochInfoData = hsdProgram.coder.accounts.decode(
          "subDaoEpochInfoV0",
          subDaoEpochInfoAccount.data,
        );

        if (!subDaoEpochInfoData.rewardsIssuedAt) return null;

        const commonAccounts = {
          position: position.pubkey,
          mint: position.mint,
          positionTokenAccount: getAssociatedTokenAddressSync(
            position.mint,
            walletPubkey,
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
              ),
              delegatorPoolCircuitBreaker: accountWindowedBreakerKey(
                subDaoAcc.delegatorPool,
              )[0],
            })
            .instruction();
        }
      }),
    );

    const validInstructions = batchInstructions.filter(truthy);
    if (validInstructions.length > 0) {
      allInstructionBatches.push(validInstructions);
    }
  }

  return {
    instructionBatches: allInstructionBatches,
    hasMore: hitCap,
    hasRewards: allInstructionBatches.length > 0,
    rewardMints: [...rewardMintSet].map((m) => new PublicKey(m)),
  };
}
