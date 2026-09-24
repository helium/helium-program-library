/**
 * Whether an Anchor IDL account holds the same IDL as a local IDL file.
 *
 * The deploy re-run rules read this: a program whose on-chain bytes match the
 * build still ships when its IDL differs. Anchor stores the IDL account and an
 * IDL buffer the same way: an 8 byte discriminator, the 32 byte authority, a
 * u32 LE length, and that many bytes of zlib-compressed JSON.
 *
 * Node builtins only, so `plan-deploy` runs it before the workspace install.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

const USAGE =
  "Usage: SOLANA_URL=<rpc> node scripts/idl-account.mjs --address <idl account> --idl <path>";

const HEADER = 8 + 32;

/** The IDL JSON an Anchor IDL account or IDL buffer holds. */
export const decodeIdlAccount = (data) => {
  const length = data.readUInt32LE(HEADER);
  const start = HEADER + 4;
  if (start + length > data.length) {
    throw new Error(
      `IDL length ${length} runs past the ${data.length} byte account`,
    );
  }
  return JSON.parse(
    inflateSync(data.subarray(start, start + length)).toString("utf8"),
  );
};

const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;

/** Whether two IDLs are equal, with object key order ignored. */
export const sameIdl = (a, b) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/**
 * Whether the account `data` holds `idl`. Missing or undecodable data does not
 * match: the run then writes a new IDL buffer.
 */
export const idlMatches = (data, idl) => {
  if (!data) return false;
  try {
    return sameIdl(decodeIdlAccount(data), idl);
  } catch {
    return false;
  }
};

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    const value = argv[i + 1];
    if (!["--address", "--idl"].includes(name) || value === undefined) {
      throw new Error(USAGE);
    }
    args[name.slice(2)] = value;
  }
  if (!args.address || !args.idl) throw new Error(USAGE);
  return args;
};

const main = async () => {
  // The RPC URL is a secret, so it comes from the environment and never from argv.
  const url = process.env.SOLANA_URL;
  try {
    if (!url) throw new Error(USAGE);
    const args = parseArgs(process.argv.slice(2));
    const idl = JSON.parse(readFileSync(args.idl, "utf8"));
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [args.address, { encoding: "base64", commitment: "confirmed" }],
      }),
    });
    if (!response.ok) {
      throw new Error(`getAccountInfo returned HTTP ${response.status}`);
    }
    const body = await response.json();
    if (body.error) {
      throw new Error(`getAccountInfo failed: ${JSON.stringify(body.error)}`);
    }
    const value = body.result?.value;
    const data = value ? Buffer.from(value.data[0], "base64") : null;
    console.log(JSON.stringify({ match: idlMatches(data, idl) }));
  } catch (error) {
    const message = String(error?.message ?? error);
    console.error(url ? message.replaceAll(url, "<rpc-url>") : message);
    process.exit(1);
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
