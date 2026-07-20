import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection } from "@/lib/solana";
import { getTransactionFee } from "@/lib/utils/balance-validation";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import {
  delegatedPositionKey,
  getLockupEffectiveEndTs,
  init as initHsd,
  subDaoEpochInfoKey,
} from "@helium/helium-sub-daos-sdk";
import { init as initProxy } from "@helium/nft-proxy-sdk";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  requirePositionOwnership,
  getCurrentSeasonEnd,
  getLockupKind,
  LockupKind,
} from "../helpers";

export const extend = publicProcedure.governance.extendDelegation.handler(
  async ({ input, errors }) => {
    const { walletAddress, positionMint } = input;

    const { connection, provider } = createSolanaConnection(walletAddress);
    const walletPubkey = new PublicKey(walletAddress);
    const positionMintPubkey = new PublicKey(positionMint);

    const vsrProgram = await initVsr(provider);
    const hsdProgram = await initHsd(provider);
    const proxyProgram = await initProxy(provider);

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

    const registrar = await vsrProgram.account.registrar.fetch(
      positionAcc.registrar,
    );
    const proxyConfig = await proxyProgram.account.proxyConfigV0.fetch(
      registrar.proxyConfig,
    );

    const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
    const unixTime = clock!.data.readBigInt64LE(8 * 4);
    const now = new BN(Number(unixTime));

    const lockupKind = getLockupKind(positionAcc.lockup);
    if (
      lockupKind !== LockupKind.CONSTANT &&
      positionAcc.lockup.endTs.lte(now)
    ) {
      throw errors.BAD_REQUEST({
        message: "Position lockup has fully decayed and cannot be extended",
      });
    }

    if (delegatedPositionAcc.expirationTs.lte(now)) {
      throw errors.BAD_REQUEST({
        message:
          "Delegation has expired and cannot be extended. Re-delegate the position instead.",
      });
    }

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.DELEGATION_EXTEND,
      walletAddress,
      positionMint,
    });

    const seasonEnd = getCurrentSeasonEnd(proxyConfig.seasons || [], now);

    if (!seasonEnd) {
      throw errors.BAD_REQUEST({
        message: "No new valid expiration timestamp found",
      });
    }

    const lockupEnd = getLockupEffectiveEndTs(positionAcc.lockup);
    const newExpirationTs = BN.min(seasonEnd, lockupEnd);

    if (delegatedPositionAcc.expirationTs.gte(newExpirationTs)) {
      return {
        transactionData: { transactions: [], parallel: false, tag },
        estimatedSolFee: await toTokenAmountOutput(new BN(0), NATIVE_MINT.toBase58()),
      };
    }

    const oldExpirationTs = delegatedPositionAcc.expirationTs;

    const oldSubDaoEpochInfo = subDaoEpochInfoKey(
      delegatedPositionAcc.subDao,
      oldExpirationTs,
    )[0];
    const newSubDaoEpochInfo = subDaoEpochInfoKey(
      delegatedPositionAcc.subDao,
      newExpirationTs,
    )[0];
    const genesisEndSubDaoEpochInfo = subDaoEpochInfoKey(
      delegatedPositionAcc.subDao,
      positionAcc.genesisEnd.lt(now) ? newExpirationTs : positionAcc.genesisEnd,
    )[0];

    const instructions: TransactionInstruction[] = [];

    instructions.push(
      await hsdProgram.methods
        .extendExpirationTsV0()
        .accountsPartial({
          position: positionPubkey,
          subDao: delegatedPositionAcc.subDao,
          oldClosingTimeSubDaoEpochInfo: oldSubDaoEpochInfo,
          closingTimeSubDaoEpochInfo: newSubDaoEpochInfo,
          genesisEndSubDaoEpochInfo,
        })
        .instruction(),
    );

    const tx = await buildVersionedTransaction({
      connection,
      draft: { instructions, feePayer: walletPubkey },
    });

    const txFee = getTransactionFee(tx);

    const walletBalance = await connection.getBalance(walletPubkey);
    if (walletBalance < txFee) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required: txFee, available: walletBalance },
      });
    }

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "delegation_extend",
              description: "Extend delegation expiration",
            },
          },
        ],
        parallel: false,
        tag,
        actionMetadata: { type: "delegation_extend", positionMint },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(txFee),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
