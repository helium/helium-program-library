import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { getJitoTipAmountLamports } from "@/lib/utils/jito";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  delegatedPositionKey,
  init as initHsd,
} from "@helium/helium-sub-daos-sdk";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  requirePositionOwnershipWithMessage,
  buildClaimInstructions,
  buildBatchedTransactions,
} from "../helpers";
import type { InstructionGroup } from "../helpers";

export const claimRewards =
  publicProcedure.governance.claimDelegationRewards.handler(
    async ({ input, errors }) => {
      const { walletAddress, positionMints } = input;

      const { connection, provider } = createSolanaConnection(walletAddress);
      const walletPubkey = new PublicKey(walletAddress);

      const vsrProgram = await initVsr(provider);
      const hsdProgram = await initHsd(provider);

      const positionMintPubkeys = positionMints.map((m) => new PublicKey(m));
      const positionPubkeys = positionMintPubkeys.map((m) => positionKey(m)[0]);
      const delegatedPosKeys = positionPubkeys.map(
        (p) => delegatedPositionKey(p)[0],
      );

      const [positionAccounts, delegatedPositionAccounts] = await Promise.all([
        vsrProgram.account.positionV0.fetchMultiple(positionPubkeys),
        hsdProgram.account.delegatedPositionV0.fetchMultiple(delegatedPosKeys),
      ]);

      const positions = [];
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

        const delegatedPositionAcc = delegatedPositionAccounts[i];
        if (!delegatedPositionAcc) {
          throw errors.BAD_REQUEST({
            message: `Position ${positionMints[i]} is not delegated`,
          });
        }

        positions.push({
          mint: positionMintPubkeys[i],
          pubkey: positionPubkeys[i],
          account: positionAcc,
          delegatedPositionKey: delegatedPosKeys[i],
          delegatedPosition: delegatedPositionAcc,
        });
      }

      const claimResult = await buildClaimInstructions({
        positions,
        walletPubkey,
        connection,
        hsdProgram,
      });

      const tag = generateTransactionTag({
        type: TRANSACTION_TYPES.DELEGATION_CLAIM_REWARDS,
        walletAddress,
        positionCount: positionMints.length,
      });

      if (!claimResult.hasRewards) {
        return {
          transactionData: { transactions: [], parallel: false, tag },
          hasMore: false,
          estimatedSolFee: toTokenAmountOutput(
            new BN(0),
            NATIVE_MINT.toBase58(),
          ),
        };
      }

      const allGroups: InstructionGroup[] = claimResult.instructionBatches.map(
        (instructions) => ({
          instructions,
          metadata: {
            type: "delegation_claim_rewards",
            description: "Claim delegation rewards",
          },
        }),
      );

      const {
        transactions,
        versionedTransactions,
        hasMore: batchHasMore,
      } = await buildBatchedTransactions({
        groups: allGroups,
        connection,
        feePayer: walletPubkey,
      });

      const cluster = getCluster();
      const jitoTipCost =
        (cluster === "mainnet" || cluster === "mainnet-beta") &&
        versionedTransactions.length > 1
          ? getJitoTipAmountLamports()
          : 0;
      const txFee = getTotalTransactionFees(versionedTransactions) + jitoTipCost;

      const walletBalance = await connection.getBalance(walletPubkey);
      if (walletBalance < txFee) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance for transaction fees",
          data: { required: txFee, available: walletBalance },
        });
      }

      return {
        transactionData: {
          transactions,
          parallel: false,
          tag,
        },
        hasMore: claimResult.hasMore || batchHasMore,
        estimatedSolFee: toTokenAmountOutput(
          new BN(txFee),
          NATIVE_MINT.toBase58(),
        ),
      };
    },
  );
