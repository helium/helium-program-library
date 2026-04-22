import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { getJitoTipAmountLamports } from "@/lib/utils/jito";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  requirePositionOwnershipWithMessage,
  buildBatchedTransactions,
} from "../helpers";
import type { InstructionGroup } from "../helpers";
import { init as initProxy, proxyAssignmentKey } from "@helium/nft-proxy-sdk";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { getAssociatedTokenAddressSync, NATIVE_MINT } from "@solana/spl-token";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";

export const unassign = publicProcedure.governance.unassignProxies.handler(
  async ({ input, errors }) => {
    const { walletAddress, proxyKey, positionMints } = input;

    const { connection, provider } = createSolanaConnection(walletAddress);
    const walletPubkey = new PublicKey(walletAddress);
    const proxyKeyPubkey = new PublicKey(proxyKey);

    const vsrProgram = await initVsr(provider);
    const proxyProgram = await initProxy(provider);

    const positionMintPubkeys = positionMints.map((m) => new PublicKey(m));
    const positionPubkeys = positionMintPubkeys.map((m) => positionKey(m)[0]);

    const positionAccounts =
      await vsrProgram.account.positionV0.fetchMultiple(positionPubkeys);

    const registrarCache = new Map<
      string,
      Awaited<ReturnType<typeof vsrProgram.account.registrar.fetch>>
    >();

    const allInstructions: TransactionInstruction[][] = [];

    for (let i = 0; i < positionMints.length; i++) {
      const positionMintPubkey = positionMintPubkeys[i];
      const positionAcc = positionAccounts[i];

      if (!positionAcc) {
        throw errors.NOT_FOUND({
          message: `Position ${positionMints[i]} not found`,
        });
      }

      await requirePositionOwnershipWithMessage(
        connection,
        positionMintPubkey,
        walletPubkey,
        positionMints[i],
        errors,
      );

      const registrarKey = positionAcc.registrar.toBase58();
      let registrar = registrarCache.get(registrarKey);
      if (!registrar) {
        registrar = await vsrProgram.account.registrar.fetch(
          positionAcc.registrar,
        );
        registrarCache.set(registrarKey, registrar);
      }

      const proxyConfig = registrar.proxyConfig;
      const ownedAssetProxyAssignmentAddress = proxyAssignmentKey(
        proxyConfig,
        positionMintPubkey,
        PublicKey.default,
      )[0];

      const baseAssignment =
        await proxyProgram.account.proxyAssignmentV0.fetchNullable(
          ownedAssetProxyAssignmentAddress,
        );

      if (
        !baseAssignment ||
        baseAssignment.nextVoter.equals(PublicKey.default)
      ) {
        continue;
      }

      const chain: { address: PublicKey; voter: PublicKey }[] = [];
      let currentVoter = baseAssignment.nextVoter;
      while (!currentVoter.equals(PublicKey.default)) {
        const addr = proxyAssignmentKey(
          proxyConfig,
          positionMintPubkey,
          currentVoter,
        )[0];
        chain.push({ address: addr, voter: currentVoter });
        const acc =
          await proxyProgram.account.proxyAssignmentV0.fetchNullable(addr);
        if (!acc) break;
        currentVoter = acc.nextVoter;
      }

      const targetIndex = chain.findIndex((c) =>
        c.voter.equals(proxyKeyPubkey),
      );
      if (targetIndex === -1) {
        continue;
      }

      const prevAddress =
        targetIndex === 0
          ? ownedAssetProxyAssignmentAddress
          : chain[targetIndex - 1].address;

      allInstructions.push([
        await proxyProgram.methods
          .unassignProxyV0()
          .accountsPartial({
            asset: positionMintPubkey,
            prevProxyAssignment: prevAddress,
            currentProxyAssignment: ownedAssetProxyAssignmentAddress,
            proxyAssignment: chain[targetIndex].address,
            voter: PublicKey.default,
            approver: walletPubkey,
            tokenAccount: getAssociatedTokenAddressSync(
              positionMintPubkey,
              walletPubkey,
            ),
          })
          .instruction(),
      ]);
    }

    const groups: InstructionGroup[] = allInstructions.map((instructions) => ({
      instructions,
      metadata: {
        type: "proxy_unassign",
        description: `Remove voting proxy ${proxyKey.slice(0, 8)}...`,
      },
    }));

    if (groups.length === 0) {
      throw errors.BAD_REQUEST({
        message:
          "No proxy assignments to remove - positions have no active proxy for this key",
      });
    }

    const { transactions, versionedTransactions, hasMore } =
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
    const totalFee =
      getTotalTransactionFees(versionedTransactions) + jitoTipCost;

    const walletBalance = await connection.getBalance(walletPubkey);
    if (walletBalance < totalFee) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required: totalFee, available: walletBalance },
      });
    }

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.PROXY_UNASSIGN,
      walletAddress,
      proxyKey,
      positionCount: positionMints.length,
    });

    return {
      transactionData: {
        transactions,
        parallel: true,
        tag,
        actionMetadata: {
          type: "proxy_unassign",
          proxyKey,
          positionCount: positionMints.length,
        },
      },
      hasMore,
      estimatedSolFee: await toTokenAmountOutput(
        new BN(totalFee),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
