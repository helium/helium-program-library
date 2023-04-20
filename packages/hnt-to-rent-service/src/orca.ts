import {
  DecimalUtil,
  Instruction,
  Percentage,
  TransactionBuilder,
} from "@orca-so/common-sdk";
import {
  ORCA_WHIRLPOOL_PROGRAM_ID,
  WhirlpoolContext,
  buildWhirlpoolClient,
  swapQuoteByOutputToken,
} from "@orca-so/whirlpools-sdk";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import Decimal from "decimal.js";
import { provider } from "./solana";

class PubkeyWallet {
  constructor(private pubkey: PublicKey) {}
  get publicKey(): PublicKey {
    return this.pubkey;
  }

  // This wallet cannot sign transaction because it doesn't have private key.
  signAllTransactions(txs: Transaction[]): Promise<Transaction[]> {
    return null; /* no impl */
  }
  signTransaction(tx: Transaction): Promise<Transaction> {
    return null; /* no impl */
  }
}

const HNT_SOL = new PublicKey("5qrvgpvr55Eo7c5bBcwopdiQ6TpvceiRm42yjHTbtDvc");
export async function fundFees(
  userWalletPubkey: PublicKey
): Promise<Transaction> {
  const connection = provider.connection;
  const platformWallet = provider.wallet;

  // this wallet doesn't contain private key
  const pubkeyUserWallet = new PubkeyWallet(userWalletPubkey);

  const ctx = WhirlpoolContext.from(
    connection,
    pubkeyUserWallet,
    ORCA_WHIRLPOOL_PROGRAM_ID
  );
  const client = buildWhirlpoolClient(ctx);

  const pool = await client.getPool(HNT_SOL);
  const sol = pool.getTokenAInfo();

  const outputU64 = DecimalUtil.toU64(new Decimal("0.020015"), sol.decimals);
  const acceptableSlippage = Percentage.fromFraction(1, 100); // 1%
  const quote = await swapQuoteByOutputToken(
    pool,
    sol.mint,
    outputU64,
    acceptableSlippage,
    ctx.program.programId,
    ctx.fetcher,
    true
  );

  // Tx contains instructions to create/close WSOL token account
  const swapTx = await pool.swap(quote);

  // create rent flash loan instructions
  const rent = await ctx.fetcher.getAccountRentExempt();
  const borrowIx = SystemProgram.transfer({
    fromPubkey: platformWallet.publicKey,
    toPubkey: pubkeyUserWallet.publicKey,
    lamports: rent,
  });
  const repayIx = SystemProgram.transfer({
    fromPubkey: pubkeyUserWallet.publicKey,
    toPubkey: platformWallet.publicKey,
    lamports: rent,
  });
  const rentFlashLoanIx: Instruction = {
    instructions: [borrowIx],
    cleanupInstructions: [repayIx],
    signers: [],
  };

  // construct Tx
  // payer = platformWallet
  const builder = new TransactionBuilder(ctx.connection, platformWallet);
  builder
    .addInstruction(rentFlashLoanIx)
    .addInstruction(swapTx.compressIx(false));

  // build Tx and partial sign
  // signers are temporary SOL account
  const { transaction, signers } = await builder.build();
  transaction.feePayer = userWalletPubkey;
  if (signers.length > 0) {
    transaction.partialSign(...signers);
  }
  return platformWallet.signTransaction(transaction);
}

export async function estimate(): Promise<string> {
  const connection = provider.connection;
  const ctx = WhirlpoolContext.from(
    connection,
    provider.wallet,
    ORCA_WHIRLPOOL_PROGRAM_ID
  );
  const client = buildWhirlpoolClient(ctx);

  const pool = await client.getPool(HNT_SOL);
  const sol = pool.getTokenAInfo();

  const outputU64 = DecimalUtil.toU64(new Decimal("0.020015"), sol.decimals);
  const acceptableSlippage = Percentage.fromFraction(1, 100); // 1%
  const quote = await swapQuoteByOutputToken(
    pool,
    sol.mint,
    outputU64,
    acceptableSlippage,
    ctx.program.programId,
    ctx.fetcher,
    true
  );
  return quote.estimatedAmountOut.toString();
}
