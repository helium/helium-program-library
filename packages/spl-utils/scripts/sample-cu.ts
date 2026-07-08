#!/usr/bin/env ts-node
// Regenerate INSTRUCTION_CU_TABLE data from recent mainnet transactions.
// Run whenever an instruction is added or account structures change size:
//
//   RPC_URL=<mainnet rpc> npx ts-node -T scripts/sample-cu.ts
//
// Writes results.json next to this script and prints table entries (with
// n/med/max comments) to paste into src/computeUnitTable.ts. Instruction
// names in comments come from target/idl/*.json at the repo root.
import { Connection } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import {
  CuSampleResults,
  cuTableFromSamples,
  percentile,
  sampleComputeUnits,
} from "../src/cuSampler";
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
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
