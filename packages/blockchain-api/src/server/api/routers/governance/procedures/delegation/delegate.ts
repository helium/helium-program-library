import { publicProcedure } from "@/server/api/procedures";
import { initCachedProgram } from "@/lib/anchor-idl-cache";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  delegatedPositionKey,
  getLockupEffectiveEndTs,
  init as initHsd,
  PROGRAM_ID as HSD_PROGRAM_ID,
  subDaoKey,
} from "@helium/helium-sub-daos-sdk";
import {
  delegationClaimBotKey,
  init as initHplCrons,
  PROGRAM_ID as HPL_CRONS_PROGRAM_ID,
} from "@helium/hpl-crons-sdk";
import {
  init as initProxy,
  PROGRAM_ID as PROXY_PROGRAM_ID,
} from "@helium/nft-proxy-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import { nextAvailableTaskIds, taskKey } from "@helium/tuktuk-sdk";
import {
  init as initVsr,
  positionKey,
  PROGRAM_ID as VSR_PROGRAM_ID,
} from "@helium/voter-stake-registry-sdk";
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
import { getJitoTipAmountLamports } from "@/lib/utils/jito";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  requirePositionOwnershipWithMessage,
  getCurrentSeasonEnd,
  changeDelegationAccounts,
  closeDelegationAccounts,
  delegateAccounts,
  extendExpirationAccounts,
  buildClaimInstructions,
  type ClaimInstructionsResult,
  buildBatchedTransactions,
  PREPAID_TX_FEES,
  TASK_QUEUE,
  HNT_EPOCH,
  getLockupKind,
  LockupKind,
  getAutomationRentLamports,
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

    const [vsrProgram, hsdProgram, proxyProgram, hplCronsProgram] =
      await Promise.all([
        initCachedProgram(initVsr, VSR_PROGRAM_ID, provider),
        initCachedProgram(initHsd, HSD_PROGRAM_ID, provider),
        initCachedProgram(initProxy, PROXY_PROGRAM_ID, provider),
        initCachedProgram(initHplCrons, HPL_CRONS_PROGRAM_ID, provider),
      ]);

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

    /**
     * The per-position half of every delegation instruction's account list.
     * Supplied explicitly so `accountsStrict` leaves Anchor no account to
     * resolve, and its resolvers make no RPC calls.
     */
    const positionAccountArgs = (info: (typeof positionInfos)[number]) => ({
      wallet: walletPubkey,
      position: info.positionPubkey,
      positionMint: info.positionMintPubkey,
      lockupEndTs: getLockupEffectiveEndTs(info.positionAcc.lockup),
      genesisEndTs: info.positionAcc.genesisEnd,
      registrar: info.positionAcc.registrar,
      proxyConfig: info.registrar.proxyConfig,
      dao: subDaoAcc.dao,
      delegatedPosition: info.delegatedPosKey,
      now,
    });

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
          .accountsStrict(
            closeDelegationAccounts({
              ...positionAccountArgs(info),
              subDao: info.delegatedPositionAcc!.subDao,
              expirationTs: info.delegatedPositionAcc!.expirationTs,
            }),
          )
          .instruction(),
      );
      info.delegatedPositionAcc = null;
    }

    let claimResult: ClaimInstructionsResult = {
      instructionBatches: [],
      hasMore: false,
      hasRewards: false,
      rewardMints: [],
      unclaimableEpochs: [],
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
          // Claim txs run sequentially in a Jito bundle; a standalone sim
          // under-measures later txs (see BuildBatchedTransactionsParams).
          useTableComputeUnits: true,
        });

        const claimTxFee = await getTotalTransactionFees(
          connection,
          claimVersionedTxs,
        );
        const claimCluster = getCluster();
        const claimJitoTipCost =
          (claimCluster === "mainnet" || claimCluster === "mainnet-beta") &&
          claimVersionedTxs.length > 1
            ? getJitoTipAmountLamports()
            : 0;
        const claimRequired = claimTxFee + claimJitoTipCost;

        const claimWalletBalance = await connection.getBalance(walletPubkey);
        if (claimWalletBalance < claimRequired) {
          throw errors.INSUFFICIENT_FUNDS({
            message: "Insufficient SOL balance for transaction fees",
            data: { required: claimRequired, available: claimWalletBalance },
          });
        }

        return {
          transactionData: {
            transactions: claimTransactions,
            parallel: false,
            tag,
          },
          hasMore: true,
          estimatedSolFee: await toTokenAmountOutput(
            new BN(claimTxFee),
            NATIVE_MINT.toBase58(),
          ),
        };
      }
    }

    // closeDelegationV0 panics if any required epoch is still unclaimed.
    // changeDelegationV0 tolerates it, so only the expired closes matter here.
    const expiredMints = new Set(
      expiredPositionInfos.map((info) => info.positionMintPubkey.toBase58()),
    );
    const blocking = claimResult.unclaimableEpochs.find((u) =>
      expiredMints.has(u.positionMint.toBase58()),
    );
    if (blocking) {
      throw errors.BAD_REQUEST({
        message: `Rewards for epoch ${blocking.epoch} have not been issued yet. Try delegating again after they are issued.`,
      });
    }

    const allGroups: InstructionGroup[] = [];
    let newClaimBots = 0;

    // Every automated position queues its own tuktuk task, so all the ids are
    // reserved from one bitmap read up front. Reading the bitmap per position
    // hands out ids the earlier positions in this same bundle already took, and
    // the duplicate task account makes the bundle fail on-chain.
    const taskQueueAcc = automationEnabled
      ? await import("@helium/tuktuk-sdk")
          .then((m) => initCachedProgram(m.init, m.PROGRAM_ID, provider))
          .then((tuktukProgram) =>
            tuktukProgram.account.taskQueueV0.fetchNullable(TASK_QUEUE),
          )
      : null;
    const reservedTaskIds = taskQueueAcc
      ? nextAvailableTaskIds(taskQueueAcc.taskBitmap, positionInfos.length)
      : [];
    if (taskQueueAcc && reservedTaskIds.length < positionInfos.length) {
      throw errors.BAD_REQUEST({
        message:
          "The automation task queue does not have enough free slots. Try again later or delegate fewer positions at a time.",
      });
    }
    let nextReservedTaskIdIndex = 0;

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

        delegationInstructions.push(
          await hsdProgram.methods
            .delegateV0()
            .accountsStrict(
              delegateAccounts({
                ...positionAccountArgs(info),
                subDao: subDaoK,
                seasonEndTs: seasonEnd,
              }),
            )
            .instruction(),
        );
      } else if (!delegatedPositionAcc.subDao.equals(subDaoK)) {
        const seasonEnd = getCurrentSeasonEnd(proxyConfig.seasons, now);
        if (!seasonEnd) {
          throw errors.BAD_REQUEST({
            message: "No valid expiration timestamp found",
          });
        }

        delegationInstructions.push(
          await hsdProgram.methods
            .changeDelegationV0()
            .accountsStrict(
              changeDelegationAccounts({
                ...positionAccountArgs(info),
                subDao: subDaoK,
                oldSubDao: delegatedPositionAcc.subDao,
                expirationTs: delegatedPositionAcc.expirationTs,
                seasonEndTs: seasonEnd,
              }),
            )
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
            delegationInstructions.push(
              await hsdProgram.methods
                .extendExpirationTsV0()
                .accountsStrict(
                  extendExpirationAccounts({
                    ...positionAccountArgs(info),
                    subDao: delegatedPositionAcc.subDao,
                    expirationTs: delegatedPositionAcc.expirationTs,
                    seasonEndTs: seasonEnd,
                  }),
                )
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
          newClaimBots++;
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

        if (taskQueueAcc) {
          const nextAvailable = reservedTaskIds[nextReservedTaskIdIndex++];
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
                  true,
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
        estimatedSolFee: await toTokenAmountOutput(
          new BN(0),
          NATIVE_MINT.toBase58(),
        ),
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
      // Claim txs run sequentially in a Jito bundle; a standalone sim
      // under-measures later txs (see BuildBatchedTransactionsParams).
      useTableComputeUnits: true,
    });

    const txFees = await getTotalTransactionFees(
      connection,
      versionedTransactions,
    );
    const cluster = getCluster();
    const jitoTipCost =
      (cluster === "mainnet" || cluster === "mainnet-beta") &&
      versionedTransactions.length > 1
        ? getJitoTipAmountLamports()
        : 0;
    const automationCost = automationEnabled
      ? positionMints.length * PREPAID_TX_FEES * LAMPORTS_PER_SOL
      : 0;
    // initDelegationClaimBotV0 allocates a claim-bot account per position the
    // wallet must fund rent for. Omitting it lets a low-SOL wallet pass this
    // check and then fail on-chain with an opaque Custom(1).
    const automationRent = await getAutomationRentLamports({
      connection,
      walletPubkey,
      newClaimBots,
      // startDelegationClaimBotV1 requires an existing delegator ATA here;
      // unlike createPosition this path never creates one.
      createsHntAta: false,
    });
    const estimatedSolFeeLamports =
      txFees + jitoTipCost + automationCost + automationRent;

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
        actionMetadata: {
          type: "delegation_delegate",
          subDaoMint,
          positionCount: positionMints.length,
        },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(estimatedSolFeeLamports),
        NATIVE_MINT.toBase58(),
      ),
      hasMore,
    };
  },
);
