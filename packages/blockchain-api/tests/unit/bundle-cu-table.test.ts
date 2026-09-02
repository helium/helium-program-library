import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { expect } from "chai";
import { describe, it } from "mocha";

/**
 * Every endpoint that batches instructions into a Jito bundle must size its CU
 * limits from the static table. A standalone simulation runs against
 * pre-bundle state, so a tx that depends on an earlier tx in the same bundle
 * (DelegateV0 on a position created in tx[0]) fails to simulate and falls back
 * to a limit measured from the wrong code path.
 *
 * These endpoints are reached only through a Next handler, a database and a
 * Solana RPC, so a unit test cannot call them. What it can do is hold each one
 * to passing the option the builder offers.
 */
const SRC = join(__dirname, "../../src");

/** The helper itself declares the parameter; it is not a caller. */
const BUILDER =
  "server/api/routers/governance/procedures/helpers/build-batched-transactions.ts";

const BUNDLE_PRODUCERS = [
  "server/api/routers/governance/procedures/delegation/claim-rewards.ts",
  "server/api/routers/governance/procedures/delegation/delegate.ts",
  "server/api/routers/governance/procedures/delegation/undelegate.ts",
  "server/api/routers/governance/procedures/positions/create.ts",
  "server/api/routers/governance/procedures/proxy/assign.ts",
  "server/api/routers/governance/procedures/proxy/unassign.ts",
  "server/api/routers/governance/procedures/voting/relinquish-position-votes.ts",
  "server/api/routers/governance/procedures/voting/relinquish-vote.ts",
  "server/api/routers/governance/procedures/voting/vote.ts",
  "server/api/routers/tokens/procedures/multiTransfer.ts",
];

const CALL = "buildBatchedTransactions(";

function typescriptFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return typescriptFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

/**
 * Source with comments removed, so the option named in a prose comment does
 * not read as the option being passed. `:` before `//` keeps a URL intact.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** The argument text of every `buildBatchedTransactions(...)` call. */
function callArguments(source: string): string[] {
  const args: string[] = [];
  for (let from = 0; ; ) {
    const start = source.indexOf(CALL, from);
    if (start === -1) return args;

    const open = start + CALL.length - 1;
    let depth = 0;
    let end = open;
    for (; end < source.length; end++) {
      if (source[end] === "(") depth++;
      else if (source[end] === ")" && --depth === 0) break;
    }

    args.push(source.slice(open + 1, end));
    from = end;
  }
}

const callers = typescriptFiles(SRC)
  .map((path) => ({
    file: relative(SRC, path).split("\\").join("/"),
    calls: callArguments(code(path)),
  }))
  .filter(({ file, calls }) => file !== BUILDER && calls.length > 0);

describe("bundle producers", () => {
  // Asserted so this enumeration cannot quietly lose an entry, or gain an
  // endpoint that builds a bundle without anyone deciding how it sizes CUs.
  it("covers every endpoint that builds a batched bundle", () => {
    expect(callers.map(({ file }) => file)).to.have.members(BUNDLE_PRODUCERS);
  });

  for (const { file, calls } of callers) {
    it(`${file} sizes bundle CU limits from the static table`, () => {
      for (const args of calls) {
        expect(args).to.match(/useTableComputeUnits:\s*true/);
      }
    });
  }
});
