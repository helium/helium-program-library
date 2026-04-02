import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  daoKey,
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
import { HNT_MINT } from "@helium/spl-utils";
import { nextAvailableTaskIds, taskKey } from "@helium/tuktuk-sdk";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { init as initProxy } from "@helium/nft-proxy-sdk";
import {
  MintLayout,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { getJitoTipAmountLamports } from "@/lib/utils/jito";
import {
  toTokenAmountOutput,
  resolveTokenAmountInput,
} from "@/lib/utils/token-math";
import { TOKEN_NAMES } from "@/lib/constants/tokens";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  SECS_PER_DAY,
  PREPAID_TX_FEES,
  TASK_QUEUE,
  toLockupKindArg,
  LockupKindType,
  buildBatchedTransactions,
} from "../helpers";
import type { InstructionGroup } from "../helpers";

export const create = publicProcedure.governance.createPosition.handler(
  async ({ input, errors }) => {
    const {
      walletAddress,
      tokenAmount,
      lockupKind,
      lockupPeriodsInDays,
      subDaoMint,
      automationEnabled = false,
    } = input;

    const { connection, provider } = createSolanaConnection(walletAddress);
    const walletPubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(tokenAmount.mint);
    const amount = resolveTokenAmountInput(tokenAmount);

    const hsdProgram = await initHsd(provider);
    const vsrProgram = await initVsr(provider);
    const proxyProgram = await initProxy(provider);
    const hplCronsProgram = await initHplCrons(provider);

    const [daoK] = daoKey(mintPubkey);
    const [subDaoK] = subDaoKey(mintPubkey);

    const myDao = await hsdProgram.account.daoV0.fetchNullable(daoK);
    const mySubDao = await hsdProgram.account.subDaoV0.fetchNullable(subDaoK);
    const registrar = (mySubDao?.registrar || myDao?.registrar)!;

    if (!registrar) {
      throw errors.BAD_REQUEST({
        message: "Invalid mint - no registrar found for this token",
      });
    }

    const registrarAcc = await vsrProgram.account.registrar.fetch(registrar);
    const proxyConfig = await proxyProgram.account.proxyConfigV0.fetch(
      registrarAcc.proxyConfig
    );

    const mintKeypair = Keypair.generate();
    const [position] = positionKey(mintKeypair.publicKey);
    const instructions: TransactionInstruction[] = [];
    const delegateInstructions: TransactionInstruction[] = [];

    const mintRent = await connection.getMinimumBalanceForRentExemption(
      MintLayout.span
    );

    instructions.push(
      SystemProgram.createAccount({
        fromPubkey: walletPubkey,
        newAccountPubkey: mintKeypair.publicKey,
        lamports: mintRent,
        space: MintLayout.span,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    instructions.push(
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        0,
        position,
        position
      )
    );

    instructions.push(
      await vsrProgram.methods
        .initializePositionV0({
          kind: toLockupKindArg(lockupKind as LockupKindType) as Parameters<
            typeof vsrProgram.methods.initializePositionV0
          >[0]["kind"],
          periods: lockupPeriodsInDays,
        })
        .accountsPartial({
          registrar,
          mint: mintKeypair.publicKey,
          depositMint: mintPubkey,
          recipient: walletPubkey,
        })
        .instruction()
    );

    instructions.push(
      await vsrProgram.methods
        .depositV0({
          amount,
        })
        .accountsPartial({
          registrar,
          position,
          mint: mintPubkey,
        })
        .instruction()
    );

    if (subDaoMint) {
      const subDaoMintPubkey = new PublicKey(subDaoMint);
      const [delegateSubDaoK] = subDaoKey(subDaoMintPubkey);
      const subDaoAcc = await hsdProgram.account.subDaoV0.fetchNullable(
        delegateSubDaoK
      );

      if (!subDaoAcc) {
        throw errors.BAD_REQUEST({
          message: "Invalid sub-DAO mint - sub-DAO not found",
        });
      }

      const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
      const unixTime = clock!.data.readBigInt64LE(8 * 4);
      const currTs = Number(unixTime) + registrarAcc.timeOffset.toNumber();
      const endTs = new BN(currTs + lockupPeriodsInDays * SECS_PER_DAY);

      const expirationTs =
        [...(proxyConfig.seasons || [])]
          .reverse()
          .find((season) => new BN(currTs).gte(season.start))?.end || endTs;

      const [subDaoEpochInfo] = subDaoEpochInfoKey(delegateSubDaoK, currTs);
      const [endSubDaoEpochInfoKey] = subDaoEpochInfoKey(
        delegateSubDaoK,
        BN.min(
          getLockupEffectiveEndTs({
            kind: toLockupKindArg(lockupKind as LockupKindType),
            endTs,
          }),
          expirationTs
        )
      );

      delegateInstructions.push(
        await hsdProgram.methods
          .delegateV0()
          .accountsPartial({
            position,
            mint: mintKeypair.publicKey,
            registrar,
            subDao: delegateSubDaoK,
            dao: subDaoAcc.dao,
            subDaoEpochInfo,
            closingTimeSubDaoEpochInfo: endSubDaoEpochInfoKey,
            genesisEndSubDaoEpochInfo: endSubDaoEpochInfoKey,
          })
          .instruction()
      );

      if (automationEnabled) {
        const delegatedPosKey = delegatedPositionKey(position)[0];

        delegateInstructions.push(
          createAssociatedTokenAccountIdempotentInstruction(
            walletPubkey,
            getAssociatedTokenAddressSync(HNT_MINT, walletPubkey, true),
            walletPubkey,
            HNT_MINT
          )
        );

        delegateInstructions.push(
          await hplCronsProgram.methods
            .initDelegationClaimBotV0()
            .accountsPartial({
              delegatedPosition: delegatedPosKey,
              position,
              taskQueue: TASK_QUEUE,
              mint: mintKeypair.publicKey,
              positionTokenAccount: getAssociatedTokenAddressSync(
                mintKeypair.publicKey,
                walletPubkey,
                true
              ),
            })
            .instruction()
        );

        const delegationClaimBotK = delegationClaimBotKey(
          TASK_QUEUE,
          delegatedPosKey
        )[0];

        delegateInstructions.push(
          SystemProgram.transfer({
            fromPubkey: walletPubkey,
            toPubkey: delegationClaimBotK,
            lamports: BigInt(PREPAID_TX_FEES * LAMPORTS_PER_SOL),
          })
        );

        const tuktukProgram = await import("@helium/tuktuk-sdk").then((m) =>
          m.init(provider)
        );
        const taskQueueAcc =
          await tuktukProgram.account.taskQueueV0.fetchNullable(TASK_QUEUE);

        if (taskQueueAcc) {
          const nextAvailable = nextAvailableTaskIds(
            taskQueueAcc.taskBitmap,
            1
          )[0];
          const task = taskKey(TASK_QUEUE, nextAvailable)[0];

          delegateInstructions.push(
            await hplCronsProgram.methods
              .startDelegationClaimBotV1({
                taskId: nextAvailable,
              })
              .accountsPartial({
                delegationClaimBot: delegationClaimBotK,
                subDao: delegateSubDaoK,
                mint: mintKeypair.publicKey,
                hntMint: HNT_MINT,
                positionAuthority: walletPubkey,
                positionTokenAccount: getAssociatedTokenAddressSync(
                  mintKeypair.publicKey,
                  walletPubkey,
                  true
                ),
                taskQueue: TASK_QUEUE,
                delegatedPosition: delegatedPosKey,
                systemProgram: SystemProgram.programId,
                delegatorAta: getAssociatedTokenAddressSync(
                  HNT_MINT,
                  walletPubkey
                ),
                task,
                nextTask: task,
                rentRefund: walletPubkey,
              })
              .instruction()
          );
        }
      }
    }

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.POSITION_CREATE,
      walletAddress,
      mint: tokenAmount.mint,
      lockupKind,
      lockupPeriodsInDays,
    });

    const groups: InstructionGroup[] = [
      {
        instructions,
        metadata: {
          type: "position_create",
          description: `Create staking position with ${lockupPeriodsInDays} day ${lockupKind} lockup`,
          positionMint: mintKeypair.publicKey.toBase58(),
        },
        signers: [mintKeypair],
      },
    ];

    if (delegateInstructions.length > 0) {
      groups.push({
        instructions: delegateInstructions,
        metadata: {
          type: "position_delegate",
          description: `Delegate position to sub-DAO${
            automationEnabled ? " and set up claim automation" : ""
          }`,
        },
      });
    }

    const { transactions, versionedTransactions } =
      await buildBatchedTransactions({
        groups,
        connection,
        feePayer: walletPubkey,
      });

    const cluster = getCluster();
    const jitoTipCost =
      (cluster === "mainnet" || cluster === "mainnet-beta") &&
      versionedTransactions.length > 1
        ? getJitoTipAmountLamports()
        : 0;
    const estimatedSolFeeLamports =
      getTotalTransactionFees(versionedTransactions) +
      jitoTipCost +
      mintRent +
      (automationEnabled ? PREPAID_TX_FEES * LAMPORTS_PER_SOL : 0);

    const walletBalance = await connection.getBalance(walletPubkey);
    if (walletBalance < estimatedSolFeeLamports) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance to create position",
        data: { required: estimatedSolFeeLamports, available: walletBalance },
      });
    }

    return {
      transactionData: {
        transactions,
        parallel: false,
        tag,
        actionMetadata: {
          type: "position_create",
          tokenAmount: toTokenAmountOutput(
            new BN(tokenAmount.amount),
            tokenAmount.mint
          ),
          tokenName: TOKEN_NAMES[tokenAmount.mint],
          lockupKind,
          lockupPeriodDays: lockupPeriodsInDays,
        },
      },
      estimatedSolFee: toTokenAmountOutput(
        new BN(estimatedSolFeeLamports),
        NATIVE_MINT.toBase58()
      ),
    };
  }
);
