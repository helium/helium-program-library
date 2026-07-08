import {
  ConfirmedSignatureInfo,
  Connection,
  ParsedInstruction,
  PartiallyDecodedInstruction,
  PublicKey,
} from "@solana/web3.js";
import bs58 from "bs58";
import { COMPUTE_BUDGET_PROGRAM_ID, cuTableKey } from "./computeUnitTable";
import { COMPUTE_BUDGET_IX_LIMIT, sleep } from "./priorityFees";

// Mainnet CU sampler behind INSTRUCTION_CU_TABLE (see computeUnitTable.ts).
// Samples recent successful transactions per program and records consumed CU
// per instruction, keyed `${programId}:${discriminatorHex}` — the same key
// format as the table. Re-run whenever an instruction is added or its account
// structures change size, then regenerate the table with cuTableFromSamples.
// CLI wrapper: packages/spl-utils/scripts/sample-cu.ts.

export interface CuSampleOptions {
  /** programId (base58) -> human label, e.g. "lazy_distributor" */
  programs: Record<string, string>;
  /** signatures fetched per program (default 150) */
  sigsPerProgram?: number;
  /** delay between batched getParsedTransactions calls in ms (default 300; public-RPC friendly) */
  throttleMs?: number;
  log?: (msg: string) => void;
  /** called after each 25-tx batch with partial results, for crash-safe checkpointing */
  onCheckpoint?: (partial: CuSampleResults) => void;
}

export type TxStat = [
  signature: string,
  requestedCu: number | null,
  consumedCu: number | null
];

export interface CuSampleResults {
  /** `${programId}:${discHex}` -> consumed CU samples */
  samples: Record<string, number[]>;
  txStats: Record<string, TxStat[]>;
}

type AnyParsedIx = ParsedInstruction | PartiallyDecodedInstruction;

/** Extract SetComputeUnitLimit value, else null (runtime default applies). */
const requestedCu = (instructions: AnyParsedIx[]): number | null => {
  for (const ix of instructions) {
    if (ix.programId.toBase58() === COMPUTE_BUDGET_PROGRAM_ID && "data" in ix) {
      const data = Buffer.from(bs58.decode(ix.data));
      if (data.length >= 5 && data[0] === COMPUTE_BUDGET_IX_LIMIT)
        return data.readUInt32LE(1);
    }
  }
  return null;
};

/**
 * All "Program <pid> consumed <n> of <m> compute units" log lines, in order
 * (includes CPI invocations; a parent's consumed count includes its children).
 */
const consumedLines = (logs: string[]): [string, number][] => {
  const out: [string, number][] = [];
  for (const line of logs) {
    const p = line.split(/\s+/);
    if (
      p.length >= 7 &&
      p[0] === "Program" &&
      p[2] === "consumed" &&
      p[6] === "compute"
    ) {
      out.push([p[1], parseInt(p[3], 10)]);
    }
  }
  return out;
};

export const percentile = (vals: number[], p: number): number => {
  const v = [...vals].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(v.length * p))];
};

export const sampleComputeUnits = async (
  connection: Connection,
  {
    programs,
    sigsPerProgram = 150,
    throttleMs = 300,
    log = () => {},
    onCheckpoint,
  }: CuSampleOptions
): Promise<CuSampleResults> => {
  const samples: CuSampleResults["samples"] = {};
  const txStats: CuSampleResults["txStats"] = {};
  const seenSigs = new Set<string>();

  for (const [pid, label] of Object.entries(programs)) {
    log(`=== ${label} (${pid})`);
    // getSignaturesForAddress caps at 1000 per call — paginate so busy
    // programs (e.g. a long localnet test suite) aren't silently truncated.
    const sigInfos: ConfirmedSignatureInfo[] = [];
    let before: string | undefined;
    while (sigInfos.length < sigsPerProgram) {
      const limit = Math.min(1000, sigsPerProgram - sigInfos.length);
      const page = await connection.getSignaturesForAddress(
        new PublicKey(pid),
        { limit, before }
      );
      sigInfos.push(...page);
      if (page.length < limit) break;
      before = page[page.length - 1].signature;
    }
    const sigs = sigInfos.filter((s) => !s.err).map((s) => s.signature);
    log(`  ${sigs.length} successful signatures`);

    // Batch-fetch transactions: one getParsedTransactions RPC per chunk,
    // with throttleMs between chunks — far fewer round-trips than one call
    // per signature, at the same request rate toward public RPCs.
    const CHUNK_SIZE = 25;
    for (let start = 0; start < sigs.length; start += CHUNK_SIZE) {
      const chunk = sigs
        .slice(start, start + CHUNK_SIZE)
        .filter((s) => !seenSigs.has(s));
      chunk.forEach((s) => seenSigs.add(s));
      if (chunk.length === 0) continue;
      if (throttleMs > 0 && start > 0) await sleep(throttleMs);
      const txs = await connection.getParsedTransactions(chunk, {
        maxSupportedTransactionVersion: 0,
      });

      for (let i = 0; i < txs.length; i++) {
        const sig = chunk[i];
        const tx = txs[i];
        if (!tx || !tx.meta || tx.meta.err) continue;

        const ixs = tx.transaction.message.instructions;
        (txStats[label] ??= []).push([
          sig,
          requestedCu(ixs),
          tx.meta.computeUnitsConsumed ?? null,
        ]);

        // Instructions in execution order: each top-level ix followed by its
        // inner (CPI) ixs — most sampled traffic arrives via CPI (e.g.
        // set_current_rewards_v0 through the rewards-oracle wrapper).
        const ordered: AnyParsedIx[] = [];
        ixs.forEach((ix, idx) => {
          ordered.push(ix);
          const inner = tx.meta!.innerInstructions?.find(
            (x) => x.index === idx
          );
          if (inner) ordered.push(...(inner.instructions as AnyParsedIx[]));
        });

        // Per sampled program, zip its invocations with its consumed log
        // lines. The count-mismatch skip catches truncated logs (the log
        // limit drops consumed lines). It does NOT catch self-CPI, which
        // yields equal counts in reversed return order and would
        // misattribute CU between the two keys — no Helium program
        // self-CPIs.
        const consumed = consumedLines(tx.meta.logMessages || []);
        for (const attrPid of Object.keys(programs)) {
          const pidIxs = ordered.filter(
            (ix) => ix.programId.toBase58() === attrPid
          );
          const pidUsed = consumed
            .filter(([p]) => p === attrPid)
            .map(([, n]) => n);
          if (pidIxs.length === 0 || pidIxs.length !== pidUsed.length) continue;
          pidIxs.forEach((ix, ii) => {
            if (!("data" in ix)) return;
            const key = cuTableKey(attrPid, bs58.decode(ix.data));
            (samples[key] ??= []).push(pidUsed[ii]);
          });
        }
      }
      log(`  ${Math.min(start + CHUNK_SIZE, sigs.length)}/${sigs.length}`);
      onCheckpoint?.({ samples, txStats });
    }
  }
  return { samples, txStats };
};

/**
 * Reduce samples to INSTRUCTION_CU_TABLE values: p95 consumed CU per key
 * (raw, no margin — FALLBACK_CU_MARGIN is applied at lookup time).
 */
export const cuTableFromSamples = (
  samples: CuSampleResults["samples"]
): Record<string, number> => {
  const table: Record<string, number> = {};
  for (const [key, vals] of Object.entries(samples)) {
    if (vals.length) table[key] = percentile(vals, 0.95);
  }
  return table;
};
