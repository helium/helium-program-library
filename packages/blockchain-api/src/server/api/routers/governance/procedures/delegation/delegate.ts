import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection } from "@/lib/solana";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  delegatedPositionKey,
  getLockupEffectiveEndTs,
  init as initHsd,
  subDaoEpochInfoKey,
  subDaoKey,
} from "@helium/helium-sub-daos-sdk";
import {
  delegationClaimBotKey,
  init as initHplCrons,
} from "@helium/hpl-crons-sdk";
import { init as initProxy } from "@helium/nft-proxy-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import { nextAvailableTaskIds, taskKey } from "@helium/tuktuk-sdk";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { NATIVE_MINT, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  requirePositionOwnershipWithMessage,
  getCurrentSeasonEnd,
  buildClaimInstructions,
  buildBatchedTransactions,
  PREPAID_TX_FEES,
  TASK_QUEUE,
  HNT_EPOCH,
  getLockupKind,
  LockupKind,
} from "../helpers";
import type { InstructionGroup } from "../helpers";

export const delegate = publicProcedure.governance.delegatePositions.handler(
  async ({ input, errors }) => {
    const {
      walletAddress,
      positionMints,
      subDaoMint,
      automationEnabled = false,
    } = input;

    const { connection, provider } = createSolanaConnection(walletAddress);
    const walletPubkey = new PublicKey(walletAddress);
    const subDaoMintPubkey = new PublicKey(subDaoMint);

    const vsrProgram = await initVsr(provider);
    const hsdProgram = await initHsd(provider);
    const proxyProgram = await initProxy(provider);
    const hplCronsProgram = await initHplCrons(provider);

    const [subDaoK] = subDaoKey(subDaoMintPubkey);
    const subDaoAcc = await hsdProgram.account.subDaoV0.fetchNullable(subDaoK);

    if (!subDaoAcc) {
      throw errors.NOT_FOUND({ message: "Sub-DAO not found" });
    }

    const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
    const unixTime = clock!.data.readBigInt64LE(8 * 4);
    const now = new BN(Number(unixTime));

    const positionsNeedingClaim: {
      mint: PublicKey;
      pubkey: PublicKey;
      account: Awaited<ReturnType<typeof vsrProgram.account.positionV0.fetch>>;
      delegatedPositionKey: PublicKey;
      delegatedPosition: Awaited<
        ReturnType<typeof hsdProgram.account.delegatedPositionV0.fetch>
      >;
    }[] = [];

    const positionInfos: {
      positionMintPubkey: PublicKey;
      positionPubkey: PublicKey;
      positionAcc: Awaited<
        ReturnType<typeof vsrProgram.account.positionV0.fetch>
      >;
      delegatedPosKey: PublicKey;
      delegatedPositionAcc: Awaited<
        ReturnType<typeof hsdProgram.account.delegatedPositionV0.fetch>
      > | null;
      registrar: Awaited<ReturnType<typeof vsrProgram.account.registrar.fetch>>;
      proxyConfig: Awaited<
        ReturnType<typeof proxyProgram.account.proxyConfigV0.fetch>
      >;
      needsChange: boolean;
    }[] = [];

    const positionMintPubkeys = positionMints.map((m) => new PublicKey(m));
    const positionPubkeys = positionMintPubkeys.map((m) => positionKey(m)[0]);
    const delegatedPosKeys = positionPubkeys.map(
      (p) => delegatedPositionKey(p)[0],
    );

    const [positionAccounts, delegatedPositionAccounts] = await Promise.all([
      vsrProgram.account.positionV0.fetchMultiple(positionPubkeys),
      hsdProgram.account.delegatedPositionV0.fetchMultiple(delegatedPosKeys),
    ]);

    const registrarCache = new Map<
      string,
      Awaited<ReturnType<typeof vsrProgram.account.registrar.fetch>>
    >();
    const proxyConfigCache = new Map<
      string,
      Awaited<ReturnType<typeof proxyProgram.account.proxyConfigV0.fetch>>
    >();

    for (let i = 0; i < positionMints.length; i++) {
      const positionAcc = positionAccounts[i];
      if (!positionAcc) {
        throw errors.NOT_FOUND({
          message: `Position ${positionMints[i]} not found`,
        });
      }

      await requirePositionOwnershipWithMessage(
        connection,
        positionMintPubkeys[i],
        walletPubkey,
        positionMints[i],
        errors,
      );

      const lockupKind = getLockupKind(positionAcc.lockup);
      if (
        lockupKind !== LockupKind.CONSTANT &&
        positionAcc.lockup.endTs.lte(now)
      ) {
        throw errors.BAD_REQUEST({
          message: "Position lockup has fully decayed and cannot be delegated",
        });
      }

      const registrarKey = positionAcc.registrar.toBase58();
      let registrar = registrarCache.get(registrarKey);
      if (!registrar) {
        registrar = await vsrProgram.account.registrar.fetch(
          positionAcc.registrar,
        );
        registrarCache.set(registrarKey, registrar);
      }

      const proxyConfigKey = registrar.proxyConfig.toBase58();
      let proxyConfig = proxyConfigCache.get(proxyConfigKey);
      if (!proxyConfig) {
        proxyConfig = await proxyProgram.account.proxyConfigV0.fetch(
          registrar.proxyConfig,
        );
        proxyConfigCache.set(proxyConfigKey, proxyConfig);
      }

      const delegatedPositionAcc = delegatedPositionAccounts[i];

      const needsChange =
        delegatedPositionAcc !== null &&
        !delegatedPositionAcc.subDao.equals(subDaoK);

      if (needsChange) {
        positionsNeedingClaim.push({
          mint: positionMintPubkeys[i],
          pubkey: positionPubkeys[i],
          account: positionAcc,
          delegatedPositionKey: delegatedPosKeys[i],
          delegatedPosition: delegatedPositionAcc,
        });
      }

      positionInfos.push({
        positionMintPubkey: positionMintPubkeys[i],
        positionPubkey: positionPubkeys[i],
        positionAcc,
        delegatedPosKey: delegatedPosKeys[i],
        delegatedPositionAcc,
        registrar,
        proxyConfig,
        needsChange,
      });
    }

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.DELEGATION_DELEGATE,
      walletAddress,
      subDaoMint,
      positionCount: positionMints.length,
    });

    const expiredPositionInfos = positionInfos.filter(
      (info) =>
        !info.needsChange &&
        info.delegatedPositionAcc &&
        info.delegatedPositionAcc.expirationTs.lt(now),
    );

    for (const info of expiredPositionInfos) {
      positionsNeedingClaim.push({
        mint: info.positionMintPubkey,
        pubkey: info.positionPubkey,
        account: info.positionAcc,
        delegatedPositionKey: info.delegatedPosKey,
        delegatedPosition: info.delegatedPositionAcc!,
      });
    }

    const expiredCloseInstructions: TransactionInstruction[] = [];
    for (const info of expiredPositionInfos) {
      expiredCloseInstructions.push(
        await hsdProgram.methods
          .closeDelegationV0()
          .accountsPartial({
            position: info.positionPubkey,
            subDao: info.delegatedPositionAcc!.subDao,
          })
          .instruction(),
      );
      info.delegatedPositionAcc = null;
    }

    let claimResult = {
      instructionBatches: [] as TransactionInstruction[][],
      hasMore: false,
      hasRewards: false,
    };

    if (positionsNeedingClaim.length > 0) {
      claimResult = await buildClaimInstructions({
        positions: positionsNeedingClaim,
        walletPubkey,
        connection,
        hsdProgram,
      });

      if (claimResult.hasMore) {
        const claimGroups: InstructionGroup[] =
          claimResult.instructionBatches.map((instructions) => ({
            instructions,
            metadata: {
              type: "delegation_claim_rewards",
              description:
                "Claim delegation rewards before changing delegation",
            },
          }));

        const {
          transactions: claimTransactions,
          versionedTransactions: claimVersionedTxs,
        } = await buildBatchedTransactions({
          groups: claimGroups,
          connection,
          feePayer: walletPubkey,
        });

        const claimTxFee = getTotalTransactionFees(claimVersionedTxs);

        const claimWalletBalance = await connection.getBalance(walletPubkey);
        if (claimWalletBalance < claimTxFee) {
          throw errors.INSUFFICIENT_FUNDS({
            message: "Insufficient SOL balance for transaction fees",
            data: { required: claimTxFee, available: claimWalletBalance },
          });
        }

        return {
          transactionData: {
            transactions: claimTransactions,
            parallel: false,
            tag,
          },
          hasMore: true,
          estimatedSolFee: toTokenAmountOutput(
            new BN(claimTxFee),
            NATIVE_MINT.toBase58(),
          ),
        };
      }
    }

    const allGroups: InstructionGroup[] = [];

    for (const instructions of claimResult.instructionBatches) {
      allGroups.push({
        instructions,
        metadata: {
          type: "delegation_claim_rewards",
          description: "Claim delegation rewards before changing delegation",
        },
      });
    }

    if (expiredCloseInstructions.length > 0) {
      allGroups.push({
        instructions: expiredCloseInstructions,
        metadata: {
          type: "delegation_close_expired",
          description: "Close expired delegations before re-delegating",
        },
      });
    }

    for (const info of positionInfos) {
      const {
        positionMintPubkey,
        positionPubkey,
        positionAcc,
        delegatedPosKey,
        delegatedPositionAcc,
        proxyConfig,
      } = info;

      const delegationInstructions: TransactionInstruction[] = [];

      if (!delegatedPositionAcc) {
        const seasonEnd = getCurrentSeasonEnd(proxyConfig.seasons, now);
        if (!seasonEnd) {
          throw errors.BAD_REQUEST({
            message: "No valid expiration timestamp found",
          });
        }

        const lockupEnd = getLockupEffectiveEndTs(positionAcc.lockup);
        const closingTs = BN.min(seasonEnd, lockupEnd);

        const subDaoEpochInfo = subDaoEpochInfoKey(subDaoK, now)[0];
        const closingTimeSubDaoEpochInfo = subDaoEpochInfoKey(
          subDaoK,
          closingTs,
        )[0];
        const genesisEndSubDaoEpochInfo = subDaoEpochInfoKey(
          subDaoK,
          positionAcc.genesisEnd.lt(now) ? closingTs : positionAcc.genesisEnd,
        )[0];

        delegationInstructions.push(
          await hsdProgram.methods
            .delegateV0()
            .accountsPartial({
              position: positionPubkey,
              subDao: subDaoK,
              dao: subDaoAcc.dao,
              subDaoEpochInfo,
              closingTimeSubDaoEpochInfo,
              genesisEndSubDaoEpochInfo,
            })
            .instruction(),
        );
      } else if (!delegatedPositionAcc.subDao.equals(subDaoK)) {
        const seasonEnd = getCurrentSeasonEnd(proxyConfig.seasons, now);
        if (!seasonEnd) {
          throw errors.BAD_REQUEST({
            message: "No valid expiration timestamp found",
          });
        }

        const newExpirationTs = Math.min(
          seasonEnd.toNumber(),
          getLockupEffectiveEndTs(positionAcc.lockup).toNumber(),
        );

        const oldExpirationTs = delegatedPositionAcc.expirationTs;
        const oldSubDaoEpochInfo = subDaoEpochInfoKey(
          delegatedPositionAcc.subDao,
          now,
        )[0];
        const newSubDaoEpochInfo = subDaoEpochInfoKey(subDaoK, now)[0];
        const closingTimeSubDaoEpochInfo = subDaoEpochInfoKey(
          subDaoK,
          newExpirationTs,
        )[0];
        const oldGenesisEndSubDaoEpochInfo = subDaoEpochInfoKey(
          delegatedPositionAcc.subDao,
          positionAcc.genesisEnd.lt(now)
            ? oldExpirationTs
            : positionAcc.genesisEnd,
        )[0];
        const genesisEndSubDaoEpochInfo = subDaoEpochInfoKey(
          subDaoK,
          positionAcc.genesisEnd.lt(now)
            ? newExpirationTs
            : positionAcc.genesisEnd,
        )[0];

        delegationInstructions.push(
          await hsdProgram.methods
            .changeDelegationV0()
            .accountsPartial({
              position: positionPubkey,
              subDao: subDaoK,
              oldSubDao: delegatedPositionAcc.subDao,
              oldSubDaoEpochInfo,
              oldGenesisEndSubDaoEpochInfo,
              subDaoEpochInfo: newSubDaoEpochInfo,
              closingTimeSubDaoEpochInfo,
              genesisEndSubDaoEpochInfo,
            })
            .instruction(),
        );
      } else {
        const seasonEnd = getCurrentSeasonEnd(proxyConfig.seasons, now);
        if (seasonEnd) {
          const lockupEnd = getLockupEffectiveEndTs(positionAcc.lockup);
          const newExpirationTs = Math.min(
            seasonEnd.toNumber(),
            lockupEnd.toNumber(),
          );
          if (delegatedPositionAcc.expirationTs.lt(new BN(newExpirationTs))) {
            const oldExpirationTs = delegatedPositionAcc.expirationTs;
            const oldClosingTimeSubDaoEpochInfo = subDaoEpochInfoKey(
              delegatedPositionAcc.subDao,
              oldExpirationTs,
            )[0];
            const closingTimeSubDaoEpochInfo = subDaoEpochInfoKey(
              delegatedPositionAcc.subDao,
              newExpirationTs,
            )[0];
            const genesisEndSubDaoEpochInfo = subDaoEpochInfoKey(
              delegatedPositionAcc.subDao,
              positionAcc.genesisEnd.lt(now)
                ? newExpirationTs
                : positionAcc.genesisEnd,
            )[0];

            delegationInstructions.push(
              await hsdProgram.methods
                .extendExpirationTsV0()
                .accountsPartial({
                  position: positionPubkey,
                  subDao: delegatedPositionAcc.subDao,
                  oldClosingTimeSubDaoEpochInfo,
                  closingTimeSubDaoEpochInfo,
                  genesisEndSubDaoEpochInfo,
                })
                .instruction(),
            );
          }
        }
      }

      if (delegationInstructions.length > 0) {
        allGroups.push({
          instructions: delegationInstructions,
          metadata: {
            type: "delegation_delegate",
            description: "Delegate position to sub-DAO",
          },
        });
      }

      const automationInstructions: TransactionInstruction[] = [];

      const delegationClaimBotK = delegationClaimBotKey(
        TASK_QUEUE,
        delegatedPosKey,
      )[0];
      const delegationClaimBot =
        await hplCronsProgram.account.delegationClaimBotV0.fetchNullable(
          delegationClaimBotK,
        );

      if (automationEnabled) {
        if (
          delegatedPositionAcc &&
          delegatedPositionAcc.lastClaimedEpoch.toNumber() < HNT_EPOCH &&
          !info.needsChange
        ) {
          throw errors.BAD_REQUEST({
            message:
              "Must claim IOT/MOBILE delegation rewards before enabling automation",
          });
        }

        if (!delegationClaimBot) {
          automationInstructions.push(
            await hplCronsProgram.methods
              .initDelegationClaimBotV0()
              .accountsPartial({
                delegatedPosition: delegatedPosKey,
                position: positionPubkey,
                taskQueue: TASK_QUEUE,
                mint: positionMintPubkey,
                positionTokenAccount: getAssociatedTokenAddressSync(
                  positionMintPubkey,
                  walletPubkey,
                  true,
                ),
              })
              .instruction(),
          );

          automationInstructions.push(
            SystemProgram.transfer({
              fromPubkey: walletPubkey,
              toPubkey: delegationClaimBotK,
              lamports: BigInt(PREPAID_TX_FEES * LAMPORTS_PER_SOL),
            }),
          );
        }

        const tuktukProgram = await import("@helium/tuktuk-sdk").then((m) =>
          m.init(provider),
        );
        const taskQueueAcc =
          await tuktukProgram.account.taskQueueV0.fetchNullable(TASK_QUEUE);

        if (taskQueueAcc) {
          const nextAvailable = nextAvailableTaskIds(
            taskQueueAcc.taskBitmap,
            1,
          )[0];
          const task = taskKey(TASK_QUEUE, nextAvailable)[0];

          automationInstructions.push(
            await hplCronsProgram.methods
              .startDelegationClaimBotV1({
                taskId: nextAvailable,
              })
              .accountsPartial({
                delegationClaimBot: delegationClaimBotK,
                subDao: subDaoK,
                mint: positionMintPubkey,
                hntMint: HNT_MINT,
                positionAuthority: walletPubkey,
                positionTokenAccount: getAssociatedTokenAddressSync(
                  positionMintPubkey,
                  walletPubkey,
                  true,
                ),
                taskQueue: TASK_QUEUE,
                delegatedPosition: delegatedPosKey,
                systemProgram: SystemProgram.programId,
                delegatorAta: getAssociatedTokenAddressSync(
                  HNT_MINT,
                  walletPubkey,
                ),
                task,
                nextTask:
                  !delegationClaimBot ||
                  delegationClaimBot.nextTask.equals(PublicKey.default)
                    ? task
                    : delegationClaimBot.nextTask,
                rentRefund: delegationClaimBot?.rentRefund || walletPubkey,
              })
              .instruction(),
          );
        }
      } else if (delegationClaimBot) {
        automationInstructions.push(
          await hplCronsProgram.methods
            .closeDelegationClaimBotV0()
            .accountsPartial({
              delegationClaimBot: delegationClaimBotK,
              taskQueue: TASK_QUEUE,
              position: positionPubkey,
              delegatedPosition: delegatedPosKey,
              positionTokenAccount: getAssociatedTokenAddressSync(
                positionMintPubkey,
                walletPubkey,
                true,
              ),
            })
            .instruction(),
        );
      }

      if (automationInstructions.length > 0) {
        allGroups.push({
          instructions: automationInstructions,
          metadata: {
            type: "delegation_automation",
            description: automationEnabled
              ? "Enable delegation claim automation"
              : "Disable delegation claim automation",
          },
        });
      }
    }

    if (allGroups.length === 0) {
      return {
        transactionData: { transactions: [], parallel: false, tag },
        hasMore: false,
        estimatedSolFee: toTokenAmountOutput(new BN(0), NATIVE_MINT.toBase58()),
      };
    }

    const {
      transactions: allTransactions,
      versionedTransactions,
      hasMore,
    } = await buildBatchedTransactions({
      groups: allGroups,
      connection,
      feePayer: walletPubkey,
    });

    const txFees = getTotalTransactionFees(versionedTransactions);
    const automationCost = automationEnabled
      ? positionMints.length * PREPAID_TX_FEES * LAMPORTS_PER_SOL
      : 0;
    const estimatedSolFeeLamports = txFees + automationCost;

    const walletBalance = await connection.getBalance(walletPubkey);
    if (walletBalance < estimatedSolFeeLamports) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required: estimatedSolFeeLamports, available: walletBalance },
      });
    }

    const hasClaimTransactions =
      claimResult.instructionBatches.length > 0 ||
      expiredCloseInstructions.length > 0;

    return {
      transactionData: {
        transactions: allTransactions,
        parallel: !hasClaimTransactions,
        tag,
        actionMetadata: { type: "delegation_delegate", subDaoMint, positionCount: positionMints.length },
      },
      estimatedSolFee: toTokenAmountOutput(
        new BN(estimatedSolFeeLamports),
        NATIVE_MINT.toBase58(),
      ),
      hasMore,
    };
  },
);
