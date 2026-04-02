import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { getJitoTipAmountLamports } from "@/lib/utils/jito";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  delegatedPositionKey,
  init as initHsd,
} from "@helium/helium-sub-daos-sdk";
import {
  delegationClaimBotKey,
  init as initHplCrons,
} from "@helium/hpl-crons-sdk";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { getAssociatedTokenAddressSync, NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  requirePositionOwnership,
  buildClaimInstructions,
  buildBatchedTransactions,
  TASK_QUEUE,
} from "../helpers";
import type { InstructionGroup } from "../helpers";

export const undelegate = publicProcedure.governance.undelegatePosition.handler(
  async ({ input, errors }) => {
    const { walletAddress, positionMint } = input;

    const { connection, provider } = createSolanaConnection(walletAddress);
    const walletPubkey = new PublicKey(walletAddress);
    const positionMintPubkey = new PublicKey(positionMint);

    const vsrProgram = await initVsr(provider);
    const hsdProgram = await initHsd(provider);
    const hplCronsProgram = await initHplCrons(provider);

    const [positionPubkey] = positionKey(positionMintPubkey);

    const positionAcc =
      await vsrProgram.account.positionV0.fetchNullable(positionPubkey);

    if (!positionAcc) {
      throw errors.NOT_FOUND({ message: "Position not found" });
    }

    await requirePositionOwnership(
      connection,
      positionMintPubkey,
      walletPubkey,
      errors,
    );

    const delegatedPosKey = delegatedPositionKey(positionPubkey)[0];
    const delegatedPositionAcc =
      await hsdProgram.account.delegatedPositionV0.fetchNullable(
        delegatedPosKey,
      );

    if (!delegatedPositionAcc) {
      throw errors.BAD_REQUEST({ message: "Position is not delegated" });
    }

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.DELEGATION_UNDELEGATE,
      walletAddress,
      positionMint,
    });

    const claimResult = await buildClaimInstructions({
      positions: [
        {
          mint: positionMintPubkey,
          pubkey: positionPubkey,
          account: positionAcc,
          delegatedPositionKey: delegatedPosKey,
          delegatedPosition: delegatedPositionAcc,
        },
      ],
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
            description: "Claim delegation rewards before undelegating",
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

      const cluster = getCluster();
      const claimJitoTipCost =
        (cluster === "mainnet" || cluster === "mainnet-beta") &&
        claimVersionedTxs.length > 1
          ? getJitoTipAmountLamports()
          : 0;
      const txFee = getTotalTransactionFees(claimVersionedTxs) + claimJitoTipCost;

      const walletBalance = await connection.getBalance(walletPubkey);
      if (walletBalance < txFee) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance for transaction fees",
          data: { required: txFee, available: walletBalance },
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
          new BN(txFee),
          NATIVE_MINT.toBase58(),
        ),
      };
    }

    const allGroups: InstructionGroup[] = [];

    for (const instructions of claimResult.instructionBatches) {
      allGroups.push({
        instructions,
        metadata: {
          type: "delegation_claim_rewards",
          description: "Claim delegation rewards before undelegating",
        },
      });
    }

    const delegationClaimBotK = delegationClaimBotKey(
      TASK_QUEUE,
      delegatedPosKey,
    )[0];
    const delegationClaimBot =
      await hplCronsProgram.account.delegationClaimBotV0.fetchNullable(
        delegationClaimBotK,
      );

    if (delegationClaimBot) {
      allGroups.push({
        instructions: [
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
        ],
        metadata: {
          type: "delegation_close_bot",
          description: "Close delegation claim bot",
        },
      });
    }

    allGroups.push({
      instructions: [
        await hsdProgram.methods
          .closeDelegationV0()
          .accountsPartial({
            position: positionPubkey,
            subDao: delegatedPositionAcc.subDao,
          })
          .instruction(),
      ],
      metadata: {
        type: "delegation_undelegate",
        description: "Remove delegation from position",
      },
    });

    const {
      transactions: allTransactions,
      versionedTransactions: allVersionedTxs,
      hasMore: batchHasMore,
    } = await buildBatchedTransactions({
      groups: allGroups,
      connection,
      feePayer: walletPubkey,
    });

    const undelegateCluster = getCluster();
    const undelegateJitoTipCost =
      (undelegateCluster === "mainnet" || undelegateCluster === "mainnet-beta") &&
      allVersionedTxs.length > 1
        ? getJitoTipAmountLamports()
        : 0;
    const txFee = getTotalTransactionFees(allVersionedTxs) + undelegateJitoTipCost;

    const walletBalance = await connection.getBalance(walletPubkey);
    if (walletBalance < txFee) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required: txFee, available: walletBalance },
      });
    }

    return {
      transactionData: {
        transactions: allTransactions,
        parallel: false,
        tag,
        actionMetadata: { type: "delegation_undelegate", positionMint },
      },
      hasMore: batchHasMore,
      estimatedSolFee: toTokenAmountOutput(
        new BN(txFee),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
