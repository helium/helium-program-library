import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import {
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
import { z } from "zod";

/** A base-10 token amount in base units, as Jupiter writes amounts. */
const AmountSchema = z.string().regex(/^\d+$/);

/** One instruction as Jupiter's swap API returns it. */
const JupiterInstructionSchema = z.object({
  programId: z.string(),
  accounts: z.array(
    z.object({
      pubkey: z.string(),
      isSigner: z.boolean(),
      isWritable: z.boolean(),
    }),
  ),
  data: z.string(),
});

type JupiterInstruction = z.infer<typeof JupiterInstructionSchema>;

/** The fields of a Swap V2 `/build` response this procedure reads. */
const JupiterBuildResponseSchema = z.object({
  inputMint: z.string(),
  outputMint: z.string(),
  inAmount: AmountSchema,
  outAmount: AmountSchema,
  otherAmountThreshold: AmountSchema,
  routePlan: z.array(z.object({ swapInfo: z.object({ label: z.string() }) })),
  setupInstructions: z.array(JupiterInstructionSchema).nullish(),
  swapInstruction: JupiterInstructionSchema,
  cleanupInstruction: JupiterInstructionSchema.nullish(),
  otherInstructions: z.array(JupiterInstructionSchema).nullish(),
  addressesByLookupTableAddress: z
    .record(z.string(), z.array(z.string()))
    .nullish(),
});

/** The only swap mode `/build` builds. */
const BUILD_SWAP_MODE = "ExactIn";

/**
 * How many times `/build` is asked again, with a narrower slippage, when its
 * re-quote enforces a lower minimum output than the caller's quote.
 */
const MIN_OUTPUT_RETRIES = 1;

/** Basis points in a whole. */
const BPS = BigInt(10_000);

/** The refusal a wallet maps to "refresh the quote". */
const QUOTE_EXPIRED_MESSAGE =
  "Quote expired: the current route's minimum output is below the quote's; refresh the quote";

/**
 * The slippage, in basis points rounded down, that keeps a re-quote of
 * `outAmount` at or above `minimum`. 0 when no slippage does.
 */
const slippageBpsKeeping = (outAmount: bigint, minimum: bigint): bigint =>
  outAmount < minimum ? BigInt(0) : ((outAmount - minimum) * BPS) / outAmount;

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

/** The DEX labels in a comma-separated `excludeDexes`, without blanks. */
const excludedLabels = (excludeDexes: string | undefined): Set<string> =>
  new Set(
    (excludeDexes ?? "")
      .split(",")
      .map((label) => label.trim())
      .filter((label) => label.length > 0),
  );

/**
 * Build a swap transaction through Jupiter's Swap V2 `/build`.
 *
 * `/build` quotes the route again, so the transaction swaps the quote's input
 * mint, amount and slippage, and its output amount is the one `/build`
 * returned, not the earlier quote's. The built swap's minimum output must not
 * fall below the quote's, so the chain enforces at least the floor the caller
 * was shown; a re-quote that falls below it is built once more at a narrower
 * slippage, or refused as an expired quote.
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

    if (!AmountSchema.safeParse(quoteResponse.otherAmountThreshold).success) {
      throw errors.BAD_REQUEST({
        message: "quoteResponse.otherAmountThreshold must be a base-10 amount",
      });
    }

    /** One `/build` request at `slippageBps`, validated against the quote. */
    const requestBuild = async (slippageBps: number) => {
      const buildUrl = new URL(`${env.JUPITER_API_URL}/swap/v2/build`);
      buildUrl.searchParams.set("inputMint", quoteResponse.inputMint);
      buildUrl.searchParams.set("outputMint", quoteResponse.outputMint);
      buildUrl.searchParams.set("amount", quoteResponse.inAmount);
      buildUrl.searchParams.set("taker", userPublicKey);
      buildUrl.searchParams.set("slippageBps", String(slippageBps));
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

      const raw: unknown = await buildResponse.json();

      if (
        typeof raw === "object" &&
        raw !== null &&
        "error" in raw &&
        typeof raw.error === "string" &&
        raw.error.length > 0
      ) {
        throw errors.JUPITER_ERROR({
          message: `Jupiter API returned error: ${raw.error}`,
        });
      }

      const parsed = JupiterBuildResponseSchema.safeParse(raw);
      if (!parsed.success) {
        console.error("Invalid Jupiter /build response:", parsed.error);
        throw errors.JUPITER_ERROR({
          message: "Invalid response from Jupiter API",
        });
      }
      const build = parsed.data;

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
      return build;
    };

    // otherAmountThreshold is the minimum output the swap instruction enforces
    // on chain, and a re-quote at the quote's slippage enforces less than the
    // quote whenever its output is lower. While the re-quote's output still
    // clears the quote's minimum, a narrower slippage restores that minimum,
    // so /build is asked again with it. Otherwise the swap is refused, so the
    // chain enforces at least the minimum the signer was shown.
    const quoteMinimum = BigInt(quoteResponse.otherAmountThreshold);
    let build = await requestBuild(quoteResponse.slippageBps);
    const attempts: { otherAmountThreshold: string; outAmount: string }[] = [];
    while (BigInt(build.otherAmountThreshold) < quoteMinimum) {
      attempts.push({
        otherAmountThreshold: build.otherAmountThreshold,
        outAmount: build.outAmount,
      });
      const slippageBps = slippageBpsKeeping(
        BigInt(build.outAmount),
        quoteMinimum,
      );
      if (attempts.length > MIN_OUTPUT_RETRIES || slippageBps === BigInt(0)) {
        console.warn("Jupiter /build minimum output below the quote's", {
          quoteMinimum: quoteResponse.otherAmountThreshold,
          attempts,
          retried: attempts.length > 1,
          passed: false,
        });
        throw errors.BAD_REQUEST({ message: QUOTE_EXPIRED_MESSAGE });
      }
      build = await requestBuild(Number(slippageBps));
    }
    if (attempts.length > 0) {
      console.warn("Jupiter /build minimum output below the quote's", {
        quoteMinimum: quoteResponse.otherAmountThreshold,
        attempts,
        retried: true,
        passed: true,
      });
    }

    // A guard against Jupiter routing through a DEX the caller excluded.
    const excluded = excludedLabels(excludeDexes);
    const excludedHop = build.routePlan.find((hop) =>
      excluded.has(hop.swapInfo.label),
    );
    if (excludedHop) {
      throw errors.JUPITER_ERROR({
        message: `Jupiter built a route through excluded DEX ${excludedHop.swapInfo.label}`,
      });
    }

    // otherInstructions are not characterised for /build, so the signer is
    // not handed instructions nobody has checked.
    const otherCount = build.otherInstructions?.length ?? 0;
    if (otherCount > 0) {
      throw errors.JUPITER_ERROR({
        message: `Jupiter built a swap with ${otherCount} otherInstructions, which this procedure does not sign`,
      });
    }

    const connection = new Connection(process.env.SOLANA_RPC_URL!);

    // computeBudgetInstructions are left out: buildVersionedTransaction sets
    // the compute unit limit and price itself. tipInstruction is only present
    // when tipAmount is requested, which this procedure never sends.
    const jupIxs = [
      ...(build.setupInstructions ?? []).map(toInstruction),
      toInstruction(build.swapInstruction),
      ...(build.cleanupInstruction
        ? [toInstruction(build.cleanupInstruction)]
        : []),
    ];

    const tx = await buildVersionedTransaction({
      connection,
      draft: {
        instructions: jupIxs,
        feePayer: new PublicKey(userPublicKey),
        // The tables are read from chain by key, so the transaction compiles
        // against their on-chain contents.
        addressLookupTableAddresses: Object.keys(
          build.addressesByLookupTableAddress ?? {},
        ).map((key) => new PublicKey(key)),
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
