// Shared helpers for the CU-table scripts (sample-cu.ts, check-cu-table.ts).
// Lives in scripts/ rather than src/ because loadIxNames reads target/idl off
// the local filesystem — Node-only, never part of the published library.
import fs from "node:fs";
import path from "node:path";
import { cuTableKey } from "../src/computeUnitTable";
import { percentile } from "../src/cuSampler";

const REPO = path.resolve(__dirname, "../../..");

// Every program whose instructions belong in INSTRUCTION_CU_TABLE. A new
// program shipped to mainnet must be added here or neither the sample-cu
// script nor the check-cu-table CI gate will see its instructions.
export const PROGRAMS: Record<string, string> = {
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w": "lazy_distributor",
  rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF: "rewards_oracle",
  hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8: "helium_entity_manager",
  memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr: "mobile_entity_manager",
  credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT: "data_credits",
  hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR: "helium_sub_daos",
  hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8: "voter_stake_registry",
  hexbnKYoA2GercNNhHUCCfrTRWrHjT6ujKPXTa5NPqJ: "hexboosting",
  fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6: "fanout",
  mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn: "mini_fanout",
  circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g: "circuit_breaker",
  treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5: "treasury_management",
  "1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h": "lazy_transactions",
  porcSnvH9pvcYPmQ65Y8qcZSRxQBiBBQX7UV5nmBegy: "price_oracle",
  we1cGnTxTkDP9Sk49dw1d3T7ik7V2NfnY4qDGCDHXfC: "welcome_pack",
  topqqzQZroCyRrgyM5zVq6xkFDVnfF13iixSjajydgU: "dc_auto_top",
  tdcam4m5U74pEZQrsQ7fVAav4AUXXc6z8fkhvExfRVN: "tuktuk_dca",
};

// `${programId}:${discHex}` -> "programLabel.ixName". Reads target/idl
// (the just-built IDLs) rather than @helium/idls so the check-cu-table CI
// gate names instructions from the code under test, not the last published
// package. Requires an `anchor build` — without it, names come up empty.
export const loadIxNames = (): Map<string, string> => {
  const names = new Map<string, string>();
  const byLabel = Object.fromEntries(
    Object.entries(PROGRAMS).map(([pid, label]) => [label, pid])
  );
  const idlDir = path.join(REPO, "target/idl");
  if (!fs.existsSync(idlDir)) return names;
  for (const f of fs.readdirSync(idlDir)) {
    if (!f.endsWith(".json")) continue;
    const label = f.slice(0, -5);
    const pid = byLabel[label];
    if (!pid) continue;
    const idl = JSON.parse(fs.readFileSync(path.join(idlDir, f), "utf8"));
    for (const ix of idl.instructions || []) {
      if (ix.discriminator) {
        names.set(
          cuTableKey(pid, Buffer.from(ix.discriminator)),
          `${label}.${ix.name}`
        );
      }
    }
  }
  return names;
};

// Paste-ready computeUnitTable.ts entry: comment line + key/value line.
export const formatTableEntry = (
  key: string,
  vals: number[],
  name: string,
  suffix: string = ""
): string =>
  `  // ${name} (n=${vals.length}, med=${percentile(vals, 0.5)}, max=${Math.max(
    ...vals
  )})${suffix}\n  "${key}": ${percentile(vals, 0.95)},`;
