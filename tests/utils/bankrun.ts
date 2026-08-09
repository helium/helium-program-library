import { Program, Idl } from "@coral-xyz/anchor";
import { BankrunProvider } from "anchor-bankrun";
import { Clock, ProgramTestContext, start } from "solana-bankrun";
import { PublicKey } from "@solana/web3.js";
import { execFileSync } from "child_process";
import { existsSync, statSync } from "fs";
import { join } from "path";

/**
 * Programs run in-process against solana-bankrun rather than a validator, which buys three
 * things the localnet suites cannot have: the clock can be moved, so a task with a timestamp
 * trigger fires without waiting for it; account bytes can be written directly, so state a
 * program refuses to produce is still reachable; and every failure carries its logs, since
 * there is no preflight to skip.
 */

export const TARGET_DEPLOY = join(__dirname, "..", "..", "target", "deploy");

// An SBF program is an ELF, and a truncated download is the failure this guards: a
// present-but-unusable file would otherwise be taken for a cached one.
const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);

function looksLikeAProgram(path: string): boolean {
  if (!existsSync(path) || statSync(path).size < 1024) {
    return false;
  }
  const fd = require("fs").openSync(path, "r");
  const head = Buffer.alloc(4);
  require("fs").readSync(fd, head, 0, 4, 0);
  require("fs").closeSync(fd);
  return head.equals(ELF_MAGIC);
}

/**
 * Put a program this workspace does not build where bankrun looks for it. The localnet suites
 * get these by cloning mainnet in `Anchor.toml`; bankrun needs the bytes on disk, so fetch
 * them the same way and from the same place.
 */
export function ensureDumped(name: string, programId: PublicKey, cluster = "m") {
  const path = join(TARGET_DEPLOY, `${name}.so`);
  if (looksLikeAProgram(path)) {
    return path;
  }
  execFileSync(
    "solana",
    ["program", "dump", "-u", cluster, programId.toBase58(), path],
    { stdio: "inherit" }
  );
  if (!looksLikeAProgram(path)) {
    throw new Error(`dumped ${name} to ${path}, but it is not a program`);
  }
  return path;
}

/**
 * Clone a mainnet account onto disk so bankrun can start with it, the way `Anchor.toml`'s
 * `[[test.validator.clone]]` entries do for the localnet suites. Cached under `target/`, so a
 * run costs one RPC call the first time and nothing after.
 */
export function ensureCloned(name: string, address: PublicKey, cluster = "m") {
  const path = join(TARGET_DEPLOY, `${name}.account.json`);
  if (!existsSync(path) || statSync(path).size < 2) {
    execFileSync(
      "solana",
      [
        "account",
        "-u",
        cluster,
        address.toBase58(),
        "--output",
        "json",
        "--output-file",
        path,
      ],
      // `solana account` writes the account to stdout as well as to the file; keep stderr so
      // a failure is still visible.
      { stdio: ["ignore", "ignore", "inherit"] }
    );
  }
  const { account } = JSON.parse(require("fs").readFileSync(path, "utf8"));
  const [data, encoding] = account.data;
  if (encoding !== "base64") {
    throw new Error(`${name}: expected base64 account data, got ${encoding}`);
  }
  return {
    address,
    info: {
      lamports: account.lamports,
      data: Buffer.from(data, "base64"),
      owner: new PublicKey(account.owner),
      executable: account.executable,
    },
  };
}

export async function startBankrun(
  programs: { name: string; programId: PublicKey }[],
  accounts: ReturnType<typeof ensureCloned>[] = []
): Promise<ProgramTestContext> {
  process.env.BPF_OUT_DIR = TARGET_DEPLOY;
  for (const { name, programId } of programs) {
    const path = join(TARGET_DEPLOY, `${name}.so`);
    if (!looksLikeAProgram(path)) {
      throw new Error(
        `${path} is missing or is not a program. Workspace programs come from ` +
          `\`TESTING=true anchor build\`; anything else needs ensureDumped().`
      );
    }
    void programId;
  }
  return start(programs, accounts);
}

export function providerFor(ctx: ProgramTestContext): BankrunProvider {
  return new BankrunProvider(ctx);
}

export function programFor<T extends Idl>(
  idl: T,
  provider: BankrunProvider
): Program<T> {
  return new Program<T>(idl, provider);
}

/**
 * Move the clock to `unixTimestamp`. `Clock` exposes getters only, so assigning to the value
 * returned by `getClock()` changes nothing and `setClock` then writes the original back --
 * a warp that reports success and does not happen. Always build a new one.
 */
export async function warpTo(ctx: ProgramTestContext, unixTimestamp: bigint) {
  const clock = await ctx.banksClient.getClock();
  ctx.setClock(
    new Clock(
      clock.slot,
      clock.epochStartTimestamp,
      clock.epoch,
      clock.leaderScheduleEpoch,
      unixTimestamp
    )
  );
  const now = (await ctx.banksClient.getClock()).unixTimestamp;
  if (now !== unixTimestamp) {
    throw new Error(`clock did not move: asked for ${unixTimestamp}, got ${now}`);
  }
}

export async function warpBy(ctx: ProgramTestContext, seconds: bigint) {
  const { unixTimestamp } = await ctx.banksClient.getClock();
  await warpTo(ctx, unixTimestamp + seconds);
}

/** The account's raw bytes, or null. Fails loudly rather than returning empty on a miss. */
export async function readAccount(ctx: ProgramTestContext, address: PublicKey) {
  const account = await ctx.banksClient.getAccount(address);
  return account ? Buffer.from(account.data) : null;
}

/**
 * Rewrite one account's data, keeping its owner, lamports and executable flag. This is the
 * capability the localnet suites lack: it reaches state that a program will not produce,
 * which is how a guard against pre-existing data gets tested at all.
 */
export async function overwriteAccountData(
  ctx: ProgramTestContext,
  address: PublicKey,
  data: Buffer
) {
  const existing = await ctx.banksClient.getAccount(address);
  if (!existing) {
    throw new Error(`cannot overwrite ${address.toBase58()}: it does not exist`);
  }
  ctx.setAccount(address, {
    lamports: existing.lamports,
    data,
    owner: new PublicKey(existing.owner),
    executable: existing.executable,
  });
}
