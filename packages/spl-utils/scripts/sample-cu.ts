#!/usr/bin/env ts-node
// Regenerate INSTRUCTION_CU_TABLE data from recent mainnet transactions.
// Run whenever an instruction is added or account structures change size:
//
//   RPC_URL=<mainnet rpc> npx ts-node -T scripts/sample-cu.ts
//
// Writes results.json next to this script and prints table entries (with
// n/med/max comments) to paste into src/computeUnitTable.ts. Instruction
// names in comments come from target/idl/*.json at the repo root.
//
// It also verifies the CURRENT table against this sample: the runtime fallback
// requests entry × FALLBACK_CU_MARGIN, so any instruction whose observed
// mainnet max exceeds that ceiling is under-provisioned and its fallback tx
// would fail on-chain (fee still burned under skip-preflight). Such entries —
// and any sampled instruction missing from the table — are printed, paste-ready,
// after the table dump. Exits non-zero if any exist.
import { Connection } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import {
  CuSampleResults,
  cuTableFromSamples,
  percentile,
  sampleComputeUnits,
} from "../src/cuSampler";
import {
  FALLBACK_CU_MARGIN,
  INSTRUCTION_CU_TABLE,
} from "../src/computeUnitTable";
import { formatTableEntry, loadIxNames, PROGRAMS } from "./cuTableHelpers";

const OUT = process.env.OUT || path.join(__dirname, "results.json");

const printTable = (results: CuSampleResults, names: Map<string, string>) => {
  const table = cuTableFromSamples(results.samples);
  for (const key of Object.keys(table).sort((a, b) =>
    (names.get(a) || a).localeCompare(names.get(b) || b)
  )) {
    const vals = results.samples[key];
    const name = names.get(key);
    if (!name) continue; // unknown discriminator (e.g. non-anchor data)
    console.log(formatTableEntry(key, vals, name));
  }
};

// Compare the sample against the committed table and print entries whose
// worst-case ceiling (entry × FALLBACK_CU_MARGIN) no longer covers the observed
// mainnet max, plus any sampled instruction missing from the table. Returns the
// count of problems so the caller can exit non-zero.
const verifyTable = (
  results: CuSampleResults,
  names: Map<string, string>
): number => {
  const missing: string[] = [];
  const under: string[] = [];
  for (const [key, vals] of Object.entries(results.samples)) {
    if (!vals.length) continue;
    const name = names.get(key);
    if (!name) continue;
    const entry = INSTRUCTION_CU_TABLE[key];
    if (entry === undefined) {
      missing.push(formatTableEntry(key, vals, name));
      continue;
    }
    const max = Math.max(...vals);
    // Match the runtime request (Math.ceil(total × FALLBACK_CU_MARGIN)) so the
    // gate flags an entry only when the CU it would actually request falls short.
    // floor rounded the ceiling down and over-flagged by up to one CU.
    if (Math.ceil(entry * FALLBACK_CU_MARGIN) < max) {
      // Store the observed max so entry × margin regains full headroom.
      under.push(
        `  // ${name}: mainnet max=${max} exceeded ceiling ${Math.ceil(
          entry * FALLBACK_CU_MARGIN
        )} (was ${entry})\n  "${key}": ${max},`
      );
    }
  }
  if (missing.length) {
    console.error(
      `\n${missing.length} sampled instruction(s) MISSING from` +
        ` INSTRUCTION_CU_TABLE — paste into src/computeUnitTable.ts:`
    );
    console.error(missing.join("\n"));
  }
  if (under.length) {
    console.error(
      `\n${under.length} entr(y/ies) UNDER worst-case (entry ×` +
        ` ${FALLBACK_CU_MARGIN} < mainnet max) — raise in src/computeUnitTable.ts:`
    );
    console.error(under.join("\n"));
  }
  return missing.length + under.length;
};

const main = async () => {
  const connection = new Connection(
    process.env.RPC_URL || "https://api.mainnet-beta.solana.com"
  );
  const names = loadIxNames();
  const results = await sampleComputeUnits(connection, {
    programs: PROGRAMS,
    sigsPerProgram: parseInt(process.env.SIGS || "150", 10),
    throttleMs: parseInt(process.env.THROTTLE_MS || "300", 10),
    log: (m) => console.error(m),
    onCheckpoint: (partial) =>
      fs.writeFileSync(OUT, JSON.stringify(partial, null, 1)),
  });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.error(`wrote ${OUT}\n`);

  printTable(results, names);

  for (const [label, rows] of Object.entries(results.txStats).sort()) {
    const ratios = rows.filter(([, r, c]) => r && c).map(([, r, c]) => r! / c!);
    if (ratios.length) {
      console.error(
        `${label}: tx n=${ratios.length} med over-request=${percentile(
          ratios,
          0.5
        ).toFixed(1)}x`
      );
    }
  }

  const problems = verifyTable(results, names);
  console.error(
    problems === 0
      ? "\nCU table OK: every sampled instruction covered within worst-case margin."
      : `\n${problems} CU-table problem(s) — see above.`
  );
  if (problems > 0) process.exitCode = 1;
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
