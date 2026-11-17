import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import {
  AccountInfo,
  Connection,
  PublicKey,
  SystemProgram,
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
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  getAccountLen,
  getExtensionTypes,
  unpackMint,
} from "@solana/spl-token";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { TOKEN_NAMES } from "@/lib/constants/tokens";
import { classifyJupiterError } from "@/lib/utils/jupiter-errors";
import {
  ALWAYS_EXCLUDED_LABELS,
  BUILD_SWAP_MODE,
  checkBuildAnswer,
  excludedLabels,
} from "./build-request";
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
 * `outAmount` at or above `minimum`. 0 when no slippage of 1 bp or more
 * does, which refuses the swap: a re-quote that clears `minimum` by less than
 * 1 bp is refused as an expired quote.
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

/**
 * The associated token program's Create (no data, or 0) and
 * CreateIdempotent (1) instructions; RecoverNested (2) creates nothing.
 */
const ATA_CREATE_DISCRIMINATORS = new Set([0, 1]);

/** A token account a setup instruction creates with the taker as payer. */
interface TakerAccountCreation {
  address: PublicKey;
  mint: PublicKey;
  tokenProgram: PublicKey;
}

/**
 * The associated token accounts `instructions` create and the taker pays
 * for, one entry per address. The associated token program lays the
 * accounts out as payer, account, owner, mint, system program, token
 * program.
 */
const takerAccountCreations = (
  instructions: JupiterInstruction[],
  taker: string,
): TakerAccountCreation[] => {
  const creations = new Map<string, TakerAccountCreation>();
  for (const instruction of instructions) {
    if (instruction.programId !== ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()) {
      continue;
    }
    const data = Buffer.from(instruction.data, "base64");
    if (data.length > 0 && !ATA_CREATE_DISCRIMINATORS.has(data[0])) {
      continue;
    }
    const [payer, account, , mint, , tokenProgram] = instruction.accounts;
    if (!payer || !account || !mint || !tokenProgram) {
      continue;
    }
    if (payer.pubkey !== taker) {
      continue;
    }
    creations.set(account.pubkey, {
      address: new PublicKey(account.pubkey),
      mint: new PublicKey(mint.pubkey),
      tokenProgram: new PublicKey(tokenProgram.pubkey),
    });
  }
  return [...creations.values()];
};

/** A Token-2022 associated token account without any mint extension. */
const TOKEN_2022_BASE_ACCOUNT_SPACE = getAccountLen([
  ExtensionType.ImmutableOwner,
]);

/**
 * The account extensions the token program allocates in a new account for
 * each mint extension that requires one. Mint extensions not listed here add
 * nothing: ConfidentialTransferMint, for one, leaves its account extension to
 * a later reallocation.
 */
const ACCOUNT_EXTENSIONS_OF_MINT_EXTENSION = new Map<
  ExtensionType,
  ExtensionType[]
>([
  [ExtensionType.TransferFeeConfig, [ExtensionType.TransferFeeAmount]],
  [
    ExtensionType.NonTransferable,
    [ExtensionType.NonTransferableAccount, ExtensionType.ImmutableOwner],
  ],
  [ExtensionType.TransferHook, [ExtensionType.TransferHookAccount]],
  [ExtensionType.PausableConfig, [ExtensionType.PausableAccount]],
]);

/**
 * The size of a Token-2022 associated token account for `mint`: the
 * account-side extensions the mint's extensions require, plus the
 * ImmutableOwner the associated token program adds. A mint that is absent
 * or unreadable sizes as the base account; creating its account fails on
 * chain anyway.
 */
const token2022AccountSpace = (
  mint: PublicKey,
  mintInfo: AccountInfo<Buffer> | null,
): number => {
  if (!mintInfo) return TOKEN_2022_BASE_ACCOUNT_SPACE;
  try {
    const { tlvData } = unpackMint(mint, mintInfo, TOKEN_2022_PROGRAM_ID);
    const accountExtensions = new Set([
      ExtensionType.ImmutableOwner,
      ...getExtensionTypes(tlvData).flatMap(
        (extension) => ACCOUNT_EXTENSIONS_OF_MINT_EXTENSION.get(extension) ?? [],
      ),
    ]);
    return getAccountLen([...accountExtensions]);
  } catch {
    return TOKEN_2022_BASE_ACCOUNT_SPACE;
  }
};

/**
 * Lamports of rent the taker pays for the token accounts `instructions`
 * create, counting only accounts that do not exist yet. An address that holds
 * lamports but no data under the System Program does not exist yet, and its
 * lamports count toward its rent. Accounts and their Token-2022 mints are read
 * in one batch, and rent is priced once per distinct size.
 */
const takerRentLamports = async (
  connection: Connection,
  instructions: JupiterInstruction[],
  taker: string,
): Promise<number> => {
  const creations = takerAccountCreations(instructions, taker);
  if (creations.length === 0) return 0;
  const token2022Mints = [
    ...new Set(
      creations
        .filter((c) => c.tokenProgram.equals(TOKEN_2022_PROGRAM_ID))
        .map((c) => c.mint.toBase58()),
    ),
  ];
  const infos = await connection.getMultipleAccountsInfo([
    ...creations.map((c) => c.address),
    ...token2022Mints.map((mint) => new PublicKey(mint)),
  ]);
  const mintInfos = new Map(
    token2022Mints.map((mint, i) => [mint, infos[creations.length + i]]),
  );
  const absent = creations.flatMap((creation, i) => {
    const info = infos[i];
    if (
      info &&
      !(info.owner.equals(SystemProgram.programId) && info.data.length === 0)
    ) {
      return [];
    }
    return [{ creation, prefunded: info?.lamports ?? 0 }];
  });
  const spaces = absent.map(({ creation: c }) =>
    c.tokenProgram.equals(TOKEN_2022_PROGRAM_ID)
      ? token2022AccountSpace(c.mint, mintInfos.get(c.mint.toBase58()) ?? null)
      : ATA_SPACE,
  );
  const rents = new Map(
    await Promise.all(
      [...new Set(spaces)].map(
        async (space) =>
          [space, await getRentLamports(connection, space)] as const,
      ),
    ),
  );
  return absent.reduce(
    (total, { prefunded }, i) =>
      total + Math.max(0, rents.get(spaces[i])! - prefunded),
    0,
  );
};

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

    // The caller's exclusions, those the quote applied and those every swap
    // carries, sent to /build and checked against the route it builds.
    const excluded = new Set([
      ...excludedLabels(excludeDexes),
      ...(quoteResponse.excludeDexes ?? []),
      ...ALWAYS_EXCLUDED_LABELS,
    ]);

    /** One `/build` request at `slippageBps`, validated against the quote. */
    const requestBuild = async (slippageBps: number) => {
      const buildUrl = new URL(`${env.JUPITER_API_URL}/swap/v2/build`);
      buildUrl.searchParams.set("inputMint", quoteResponse.inputMint);
      buildUrl.searchParams.set("outputMint", quoteResponse.outputMint);
      buildUrl.searchParams.set("amount", quoteResponse.inAmount);
      buildUrl.searchParams.set("taker", userPublicKey);
      buildUrl.searchParams.set("slippageBps", String(slippageBps));
      buildUrl.searchParams.set("excludeDexes", [...excluded].join(","));
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

      const refusal = checkBuildAnswer(raw, excluded);
      if (refusal) {
        throw errors.JUPITER_ERROR({ message: refusal });
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
        final: {
          otherAmountThreshold: build.otherAmountThreshold,
          outAmount: build.outAmount,
        },
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
    // Rent for the token accounts the setup instructions create for the
    // taker and that do not exist yet: the output account (created even when
    // destinationTokenAccount names another), intermediate accounts of a
    // multi-hop route, and the wrapped SOL account a SOL input swaps from.
    const rentCost = await takerRentLamports(
      connection,
      build.setupInstructions ?? [],
      userPublicKey,
    );
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
