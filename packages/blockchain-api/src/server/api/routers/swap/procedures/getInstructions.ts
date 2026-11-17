import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  calculateRequiredBalance,
  getTransactionFee,
  ATA_SPACE,
  getRentLamports,
} from "@/lib/utils/balance-validation";
import { NATIVE_MINT } from "@solana/spl-token";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { TOKEN_NAMES } from "@/lib/constants/tokens";
import { classifyJupiterError } from "@/lib/utils/jupiter-errors";
import BN from "bn.js";

/** One instruction as Jupiter's swap API returns it. */
interface JupiterInstruction {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
}

/** The fields of a Swap V2 `/build` response this procedure reads. */
interface JupiterBuildResponse {
  error?: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  setupInstructions?: JupiterInstruction[];
  swapInstruction: JupiterInstruction;
  cleanupInstruction?: JupiterInstruction | null;
  otherInstructions?: JupiterInstruction[];
  addressesByLookupTableAddress?: Record<string, string[]> | null;
}

/** The only swap mode `/build` builds. */
const BUILD_SWAP_MODE = "ExactIn";

/**
 * Deactivation slot of a lookup table that has not been deactivated (u64 max).
 * `/build` returns only tables it routes through, which are active.
 */
const ACTIVE_LOOKUP_TABLE_SLOT = BigInt("18446744073709551615");

const toInstruction = (instruction: JupiterInstruction) =>
  new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, "base64"),
  });

/**
 * The lookup tables `/build` resolved, as accounts the transaction compiles
 * against, so building the swap reads no lookup table from the RPC.
 */
const toLookupTables = (
  resolved: Record<string, string[]> | null | undefined,
): AddressLookupTableAccount[] =>
  Object.entries(resolved ?? {}).map(
    ([key, addresses]) =>
      new AddressLookupTableAccount({
        key: new PublicKey(key),
        state: {
          deactivationSlot: ACTIVE_LOOKUP_TABLE_SLOT,
          lastExtendedSlot: 0,
          lastExtendedSlotStartIndex: 0,
          addresses: addresses.map((address) => new PublicKey(address)),
        },
      }),
  );

/**
 * Build a swap transaction through Jupiter's Swap V2 `/build`.
 *
 * `/build` quotes the route again, so the transaction swaps the quote's input
 * mint, amount and slippage, and its output amount is the one `/build`
 * returned, not the earlier quote's.
 */
export const getInstructions = publicProcedure.swap.getInstructions.handler(
  async ({ input, errors }) => {
    const { quoteResponse, userPublicKey, destinationTokenAccount, excludeDexes } =
      input;

    // `/build` has no swap mode and always swaps an exact input. Building an
    // ExactOut quote through it would spend the quote's inAmount as an input
    // instead of buying its outAmount.
    if (quoteResponse.swapMode !== BUILD_SWAP_MODE) {
      throw errors.BAD_REQUEST({
        message: `Only ${BUILD_SWAP_MODE} quotes can be built into a swap, got ${quoteResponse.swapMode}`,
      });
    }

    const buildUrl = new URL(`${env.JUPITER_API_URL}/swap/v2/build`);
    buildUrl.searchParams.set("inputMint", quoteResponse.inputMint);
    buildUrl.searchParams.set("outputMint", quoteResponse.outputMint);
    buildUrl.searchParams.set("amount", quoteResponse.inAmount);
    buildUrl.searchParams.set("taker", userPublicKey);
    buildUrl.searchParams.set("slippageBps", String(quoteResponse.slippageBps));
    if (excludeDexes) {
      buildUrl.searchParams.set("excludeDexes", excludeDexes);
    }
    if (destinationTokenAccount) {
      buildUrl.searchParams.set(
        "destinationTokenAccount",
        destinationTokenAccount,
      );
    }

    const buildResponse = await fetch(buildUrl.toString(), {
      headers: {
        "x-api-key": env.JUPITER_API_KEY,
      },
    });

    if (!buildResponse.ok) {
      const errorText = await buildResponse.text();
      console.error("Jupiter API error:", errorText);

      const classification = classifyJupiterError({
        status: buildResponse.status,
        body: errorText,
        operation: "Failed to build swap with Jupiter",
      });
      if (classification.kind === "BAD_REQUEST") {
        throw errors.BAD_REQUEST({ message: classification.message });
      }
      if (classification.kind === "RATE_LIMITED") {
        throw errors.RATE_LIMITED();
      }
      throw errors.JUPITER_ERROR({ message: classification.message });
    }

    const build: JupiterBuildResponse = await buildResponse.json();

    if (build.error) {
      throw errors.JUPITER_ERROR({
        message: `Jupiter API returned error: ${build.error}`,
      });
    }

    // The metadata below describes this response, so it must be a swap of the
    // mints and amount the caller asked to build.
    if (
      build.inputMint !== quoteResponse.inputMint ||
      build.outputMint !== quoteResponse.outputMint ||
      build.inAmount !== quoteResponse.inAmount
    ) {
      throw errors.JUPITER_ERROR({
        message: "Jupiter built a swap that differs from the requested quote",
      });
    }

    const connection = new Connection(process.env.SOLANA_RPC_URL!);

    // computeBudgetInstructions are left out: buildVersionedTransaction sets
    // the compute unit limit and price itself. tipInstruction is only present
    // when tipAmount is requested, which this procedure never sends.
    // otherInstructions go after cleanup, the order Jupiter's own /build
    // example assembles them in.
    const jupIxs = [
      ...(build.setupInstructions ?? []).map(toInstruction),
      toInstruction(build.swapInstruction),
      ...(build.cleanupInstruction
        ? [toInstruction(build.cleanupInstruction)]
        : []),
      ...(build.otherInstructions ?? []).map(toInstruction),
    ];

    const tx = await buildVersionedTransaction({
      connection,
      draft: {
        instructions: jupIxs,
        feePayer: new PublicKey(userPublicKey),
        addressLookupTables: toLookupTables(build.addressesByLookupTableAddress),
      },
    });

    // Check wallet has sufficient balance using actual transaction fees
    const [walletBalance, txFee] = await Promise.all([
      connection.getBalance(new PublicKey(userPublicKey)),
      getTransactionFee(connection, tx),
    ]);
    const rentCost = destinationTokenAccount
      ? 0
      : await getRentLamports(connection, ATA_SPACE);
    const solInputAmount =
      quoteResponse.inputMint === NATIVE_MINT.toBase58()
        ? Number(quoteResponse.inAmount)
        : 0;
    const required = await calculateRequiredBalance(
      connection,
      txFee,
      rentCost + solInputAmount,
    );

    if (walletBalance < required) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance to execute swap",
        data: { required, available: walletBalance },
      });
    }

    // Generate transaction tag. The destination is part of it because it is
    // where the output lands: two swaps that differ only in where the tokens
    // go are different swaps and must not share a tag.
    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.SWAP,
      userAddress: userPublicKey,
      inputMint: quoteResponse.inputMint,
      outputMint: quoteResponse.outputMint,
      amount: quoteResponse.inAmount,
      destinationTokenAccount,
    });

    // A destination names an account other than the signer's own, so the
    // signer is told where the output goes before signing for it.
    const destinationSuffix = destinationTokenAccount
      ? ` to ${destinationTokenAccount}`
      : "";

    return {
      transactions: [
        {
          serializedTransaction: serializeTransaction(tx),
          metadata: {
            type: "swap",
            description: `Swap ${build.inAmount} ${build.inputMint} for ${build.outAmount} ${build.outputMint}${destinationSuffix}`,
            inputMint: build.inputMint,
            outputMint: build.outputMint,
            inputAmount: build.inAmount,
            outputAmount: build.outAmount,
            destinationTokenAccount,
          },
        },
      ],
      parallel: false,
      tag,
      actionMetadata: {
        type: "swap",
        destinationTokenAccount,
        inputTokenAmount: await toTokenAmountOutput(
          new BN(build.inAmount),
          build.inputMint,
        ),
        outputTokenAmount: await toTokenAmountOutput(
          new BN(build.outAmount),
          build.outputMint,
        ),
        inputTokenName: TOKEN_NAMES[build.inputMint],
        outputTokenName: TOKEN_NAMES[build.outputMint],
      },
    };
  },
);
