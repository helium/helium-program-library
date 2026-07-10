#!/usr/bin/env ts-node
// CI gate for INSTRUCTION_CU_TABLE: sample the localnet traffic that the
// anchor test suite just generated and verify every exercised instruction
// has a table entry, and that none consume beyond their fallback ceiling
// (entry * FALLBACK_CU_MARGIN + bump-grind slack). Both are hard failures.
// Runs after the test-contracts mocha step while the localnet is still up.
//
//   RPC_URL=http://127.0.0.1:8899 pnpm run check-cu-table
//
// Failure output is paste-ready for src/computeUnitTable.ts. Localnet-derived
// values can run low vs mainnet (smaller accounts/trees) — re-measure with
// `pnpm run sample-cu` once the instruction has mainnet volume.
import { Connection } from "@solana/web3.js";
import {
  FALLBACK_CU_MARGIN,
  INSTRUCTION_CU_TABLE,
} from "../src/computeUnitTable";
import { cuTableFromSamples, sampleComputeUnits } from "../src/cuSampler";
import { formatTableEntry, loadIxNames, PROGRAMS } from "./cuTableHelpers";

// Localnet CU varies run-to-run: tests mint fresh random keypairs, so PDA
// bump grinding (1500 CU per find_program_address iteration) shifts each
// instruction's cost in 1500-CU steps. Flat slack absorbs that noise; real
// structural growth shows up as much larger jumps.
const BUMP_GRIND_SLACK = 10 * 1500;

const main = async () => {
  // "confirmed", not the web3.js default "finalized": this runs seconds after
  // the test suite and short suites' traffic hasn't finalized yet, so a
  // finalized query returns 0 signatures and the gate false-fails.
  const connection = new Connection(
    process.env.RPC_URL || "http://127.0.0.1:8899",
    "confirmed"
  );
  const names = loadIxNames();
  // With no IDLs every sampled key would be skipped as unlabeled and the
  // gate would pass green having verified nothing — refuse instead.
  if (names.size === 0) {
    console.error(
      "check-cu-table: no instruction names loaded (target/idl missing or" +
        " empty). Run `anchor build` first."
    );
    process.exit(1);
  }
  const results = await sampleComputeUnits(connection, {
    programs: PROGRAMS,
    sigsPerProgram: parseInt(process.env.SIGS || "1000", 10),
    throttleMs: parseInt(process.env.THROTTLE_MS || "0", 10),
    log: (m) => console.error(m),
  });
  const localTable = cuTableFromSamples(results.samples);

  // The test suite that just ran generated on-chain traffic; sampling zero
  // instructions means PROGRAMS is missing the program under test or sampling
  // broke. Passing green here would verify nothing — hard fail instead.
  if (Object.keys(localTable).length === 0) {
    console.error(
      "check-cu-table: sampled 0 instructions from the localnet. The test" +
        " suite just ran, so this means PROGRAMS omits the program under test" +
        " or sampling failed — not that the table is complete."
    );
    process.exit(1);
  }

  const missing: string[] = [];
  const drifted: string[] = [];
  for (const [key, localP95] of Object.entries(localTable)) {
    const entry = INSTRUCTION_CU_TABLE[key];
    const vals = results.samples[key];
    const label = names.get(key);
    // Skip discriminators absent from the IDLs — e.g. Anchor's IDL-account
    // instruction (40f4bc78a7e9690a) written during localnet deploys, which
    // never occurs in real traffic.
    if (!label) continue;
    if (entry === undefined) {
      missing.push(formatTableEntry(key, vals, label, " [localnet]"));
    } else if (localP95 > entry * FALLBACK_CU_MARGIN + BUMP_GRIND_SLACK) {
      drifted.push(
        `  ${label}: table=${entry}, localnet p95=${localP95} (margin ceiling ${Math.ceil(
          entry * FALLBACK_CU_MARGIN + BUMP_GRIND_SLACK
        )})`
      );
    }
  }

  if (missing.length) {
    console.error(
      `\n${missing.length} instruction(s) missing from INSTRUCTION_CU_TABLE.` +
        ` Paste into packages/spl-utils/src/computeUnitTable.ts:`
    );
    console.error(missing.join("\n"));
  }
  if (drifted.length) {
    // Hard fail: drift is the dangerous direction. The runtime fallback requests
    // exactly entry * FALLBACK_CU_MARGIN, so consumption above that ceiling means
    // the fallback UNDER-requests and the tx fails on-chain (fee still burned
    // under skip-preflight). The bump-grind slack already absorbs localnet's
    // run-to-run noise, so exceeding ceiling+slack is a structural jump. Raise the
    // flagged entry to the localnet value above (once an entry reflects its
    // localnet worst case, later noise stays within slack), or re-measure with
    // `pnpm run sample-cu` for an authoritative mainnet value.
    console.error(
      `\n${drifted.length} entr(y/ies) exceed FALLBACK_CU_MARGIN +` +
        ` bump-grind slack. Account structures likely grew; update via` +
        ` \`pnpm run sample-cu\` (mainnet) or the localnet values above:`
    );
    console.error(drifted.join("\n"));
  }
  if (missing.length || drifted.length) process.exit(1);
  console.error(
    `CU table OK: ${
      Object.keys(localTable).length
    } sampled instruction(s) covered within margin`
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
