import { Idl, Program } from "@anchor-lang/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { TuktukDca } from "@helium/idls/lib/types/tuktuk_dca";

/**
 * The programs a route's setup and cleanup instructions run against. Those instructions set no
 * return data at top level, so none needs wrapping -- which is narrower than saying these
 * programs cannot: the token program sets return data for `GetAccountDataSize`, which is what
 * the test fixture uses. An instruction against anything else is one this service has not seen
 * before and cannot reason about, so it refuses rather than guess.
 */
export const UNWRAPPED_PROGRAMS = new Set(
  [
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    ComputeBudgetProgram.programId,
    SystemProgram.programId,
  ].map((id) => id.toBase58())
);

/**
 * The callee `swap_v0` pins, read from the IDL rather than restated here so the wrap decision
 * and the on-chain `address` constraint cannot disagree — including under a TESTING build,
 * where the pin names a different program.
 *
 * `Program.idl` is camelCased by Anchor's constructor while the IDL on disk carries the Rust
 * snake_case, so both spellings are accepted and a miss is an error rather than a silent
 * `undefined` that only surfaces as a failed transaction.
 */
export function pinnedSwapProgram(idl: Idl): PublicKey {
  const instruction = idl.instructions.find(
    (i) => i.name === "swapV0" || i.name === "swap_v0"
  );
  if (!instruction) {
    throw new Error("tuktuk-dca IDL carries no swap_v0 instruction");
  }
  const account = instruction.accounts.find(
    (a) => a.name === "swapProgram" || a.name === "swap_program"
  ) as { address?: string } | undefined;
  if (!account?.address) {
    throw new Error(
      "tuktuk-dca IDL carries no pinned address for swap_v0.swap_program"
    );
  }
  return new PublicKey(account.address);
}

/**
 * Split a route's instructions into the ones that must run through `swap_v0` and the ones that
 * may run as they are.
 *
 * Refuses rather than degrades. A route instruction left unwrapped fails the whole task on the
 * return data it sets, and that failure lands on chain as a BorshIoError with nothing naming
 * the cause, so an unrecognised callee or a route that wraps nothing is an error raised here.
 */
export function planSwapWrapping(
  instructions: TransactionInstruction[],
  swapProgram: PublicKey
): { toWrap: boolean[] } {
  const toWrap = instructions.map((ix) => {
    if (ix.programId.equals(swapProgram)) {
      return true;
    }
    if (!UNWRAPPED_PROGRAMS.has(ix.programId.toBase58())) {
      throw new Error(
        `refusing to build a swap against an unrecognized program ${ix.programId.toBase58()}: it is neither the pinned swap program nor a known setup program, and running it unwrapped fails the task if it sets return data`
      );
    }
    return false;
  });

  if (!toWrap.some(Boolean)) {
    throw new Error(
      `refusing to build a swap that wraps no instruction: no route instruction ran against the pinned swap program ${swapProgram.toBase58()}`
    );
  }

  return { toWrap };
}

/**
 * Run a route's instructions through `swap_v0` where the plan says to wrap, and return them in
 * the order they run.
 *
 * The service and the DCA test server both call this, so the suite exercises the same
 * pin-and-wrap path the service runs rather than a copy of it.
 */
export const wrapRoute = async (
  program: Program<TuktukDca>,
  dca: PublicKey,
  instructions: TransactionInstruction[]
): Promise<TransactionInstruction[]> => {
  const swapProgram = pinnedSwapProgram(program.idl);
  const { toWrap } = planSwapWrapping(instructions, swapProgram);
  return Promise.all(
    instructions.map(async (ix, i) =>
      toWrap[i]
        ? program.methods
            .swapV0({ data: ix.data })
            .accounts({ dca })
            .remainingAccounts(ix.keys)
            .instruction()
        : ix
    )
  );
};
