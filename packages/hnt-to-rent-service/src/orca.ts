import {
  DecimalUtil,
  Instruction,
  Percentage,
  TransactionBuilder,
  resolveOrCreateATAs,
} from "@orca-so/common-sdk";
import {
  ORCA_WHIRLPOOL_PROGRAM_ID,
  WhirlpoolContext,
  buildWhirlpoolClient,
  swapQuoteByOutputToken,
  PDAUtil,
  twoHopSwapQuoteFromSwapQuotes,
  toTx,
  WhirlpoolIx,
} from "@orca-so/whirlpools-sdk";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import Decimal from "decimal.js";
import { provider } from "./solana";
import {
  HNT_MINT, IOT_MINT
} from "@helium/spl-utils";

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
const IOT_HNT = new PublicKey("");
const MOBILE_HNT = new PublicKey("");

export async function fundFeesFromTokens(
  userWalletPubkey: PublicKey,
  fromToken: PublicKey,
) {
  const connection = provider.connection;
  const platformWallet = provider.wallet;

  // this wallet doesn't contain private key
  const pubkeyUserWallet = new PubkeyWallet(userWalletPubkey);

  const ctx = WhirlpoolContext.from(
    connection,
    //@ts-ignore
    pubkeyUserWallet,
    ORCA_WHIRLPOOL_PROGRAM_ID
  );
  const client = buildWhirlpoolClient(ctx);

  const hntSolPool = await client.getPool(HNT_SOL);
  const tokenHntPoolKey = fromToken.equals(IOT_MINT) ? IOT_HNT : MOBILE_HNT;
  const tokenHntPool = await client.getPool(tokenHntPoolKey);
  const sol = hntSolPool.getTokenAInfo();

  const outputU64 = DecimalUtil.toU64(new Decimal("0.020015"), sol.decimals);
  const acceptableSlippage = Percentage.fromFraction(1, 100); // 1%

  // get swap quotes
  const hntToSolQuote = await swapQuoteByOutputToken(
    hntSolPool,
    sol.mint,
    outputU64,
    acceptableSlippage,
    ctx.program.programId,
    ctx.fetcher,
    true
  );
  const inputToHntQuote = await swapQuoteByOutputToken(
    tokenHntPool,
    HNT_MINT,
    hntToSolQuote.estimatedAmountIn,
    acceptableSlippage,
    ctx.program.programId,
    ctx.fetcher,
    true
  );
  const twoHopQuote = twoHopSwapQuoteFromSwapQuotes(inputToHntQuote, hntToSolQuote);

  // instructions for creating the token accounts if they are required
  const [fromTokenAta, hntAta, solAta] = await resolveOrCreateATAs(ctx.connection, userWalletPubkey, [
    { tokenMint: fromToken },
    { tokenMint: HNT_MINT },
    { tokenMint: sol.mint, wrappedSolAmountIn: outputU64 },
  ],
  () => ctx.fetcher.getAccountRentExempt());
  const { address: fromTokenAtaKey, ...fromTokenAtaIx } = fromTokenAta;
  const { address: hntAtaKey, ...hntAtaIx } = hntAta;
  const { address: solAtaKey, ...solAtaIx } = solAta;

  const swapTx = toTx(
    ctx,
    WhirlpoolIx.twoHopSwapIx(ctx.program, {
      ...twoHopQuote,
      whirlpoolOne: tokenHntPoolKey,
      whirlpoolTwo: HNT_SOL,
      tokenOwnerAccountOneA: fromTokenAtaKey,
      tokenVaultOneA: tokenHntPool.getTokenVaultAInfo().address,
      tokenOwnerAccountOneB: hntAtaKey,
      tokenVaultOneB: tokenHntPool.getTokenVaultBInfo().address,
      tokenOwnerAccountTwoA: hntAtaKey,
      tokenVaultTwoA: hntSolPool.getTokenVaultAInfo().address,
      tokenOwnerAccountTwoB: solAtaKey,
      tokenVaultTwoB: hntSolPool.getTokenVaultBInfo().address,
      oracleOne: PDAUtil.getOracle(ctx.program.programId, tokenHntPoolKey).publicKey,
      oracleTwo: PDAUtil.getOracle(ctx.program.programId, HNT_SOL).publicKey,
      tokenAuthority: ctx.wallet.publicKey,
    })
  );

  // create rent flash loan instructions
  let accountsNeeded = hntAta.instructions.length + solAta.instructions.length;
  const rent = (await ctx.fetcher.getAccountRentExempt()) * accountsNeeded;
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
  //@ts-ignore
  const builder = new TransactionBuilder(ctx.connection, platformWallet);
  builder
    .addInstruction(rentFlashLoanIx)
    .addInstructions([fromTokenAtaIx, hntAtaIx, solAtaIx])
    .addInstruction(swapTx.compressIx(false));

  // build Tx and partial sign
  const { transaction, signers } = await builder.build();
  const tx = (transaction as Transaction);
  tx.feePayer = userWalletPubkey;
  if (signers.length > 0) {
    tx.partialSign(...signers);
  }
  return platformWallet.signTransaction(tx);
}

export async function fundFeesFromHnt(
  userWalletPubkey: PublicKey,
): Promise<Transaction> {
  const connection = provider.connection;
  const platformWallet = provider.wallet;

  // this wallet doesn't contain private key
  const pubkeyUserWallet = new PubkeyWallet(userWalletPubkey);

  const ctx = WhirlpoolContext.from(
    connection,
    //@ts-ignore
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
  //@ts-ignore
  const builder = new TransactionBuilder(ctx.connection, platformWallet);
  builder
    .addInstruction(rentFlashLoanIx)
    .addInstruction(swapTx.compressIx(false));

  // build Tx and partial sign
  // signers are temporary SOL account
  const { transaction, signers } = await builder.build();
  const tx = (transaction as Transaction);
  tx.feePayer = userWalletPubkey;
  if (signers.length > 0) {
    tx.partialSign(...signers);
  }
  return platformWallet.signTransaction(tx);
}

export async function estimate(): Promise<string> {
  const connection = provider.connection;
  const ctx = WhirlpoolContext.from(
    connection,
    //@ts-ignore
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
