/**
 * Which pending Squads v4 proposals upgrade one program.
 *
 * A deploy re-run reads this before it makes a proposal. A pending proposal that
 * already names the buffer the run reuses means there is nothing to do. A pending
 * proposal on another buffer is an older release; signers reject it, so the run
 * reports its index.
 *
 * Pending is Active or Approved: both can still execute. A proposal at or below
 * the multisig's stale transaction index cannot, so the scan starts above it.
 */
import { pathToFileURL } from "node:url";

import { Connection, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const USAGE =
  "Usage: SOLANA_URL=<rpc> node scripts/pending-upgrade-proposals.mjs --multisig <address> --program-id <address> [--buffer <address>]";

const BPF_LOADER_UPGRADEABLE = "BPFLoaderUpgradeab1e11111111111111111111111";
// The loader's Upgrade instruction: a u32 LE enum tag and nothing else.
// Accounts: programData, program, buffer, spill, rent, clock, authority.
const UPGRADE_DATA = Buffer.from([3, 0, 0, 0]);
const PENDING_STATUSES = ["Active", "Approved"];
// The `getMultipleAccounts` limit.
const BATCH = 100;

const isVaultTransaction = (account) =>
  Buffer.from(multisig.accounts.vaultTransactionDiscriminator).equals(
    account.data.subarray(0, 8),
  );

/** The buffer a vault transaction upgrades `programId` from, or null. */
const upgradeBuffer = (message, programId) => {
  const key = (index) => message.accountKeys[index]?.toBase58();
  const upgrade = message.instructions.find(
    (ix) =>
      key(ix.programIdIndex) === BPF_LOADER_UPGRADEABLE &&
      UPGRADE_DATA.equals(Buffer.from(ix.data)) &&
      key(ix.accountIndexes[1]) === programId.toBase58(),
  );
  return upgrade ? (key(upgrade.accountIndexes[2]) ?? null) : null;
};

/**
 * Pending upgrade proposals for `programId`, oldest first.
 *
 * `getMultipleAccountsInfo` is `Connection.getMultipleAccountsInfo`, taken as an
 * argument so a test can serve recorded accounts.
 */
export const pendingUpgrades = async ({
  getMultipleAccountsInfo,
  multisigPda,
  programId,
}) => {
  const [multisigAccount] = await getMultipleAccountsInfo([multisigPda]);
  if (!multisigAccount) {
    throw new Error(`multisig account ${multisigPda.toBase58()} not found`);
  }
  const [{ transactionIndex, staleTransactionIndex }] =
    multisig.accounts.Multisig.fromAccountInfo(multisigAccount);

  const indexes = [];
  for (
    let index = Number(staleTransactionIndex) + 1;
    index <= Number(transactionIndex);
    index++
  ) {
    indexes.push(index);
  }

  const keys = indexes.flatMap((index) => [
    multisig.getProposalPda({
      multisigPda,
      transactionIndex: BigInt(index),
    })[0],
    multisig.getTransactionPda({ multisigPda, index: BigInt(index) })[0],
  ]);
  const accounts = [];
  for (let start = 0; start < keys.length; start += BATCH) {
    accounts.push(
      ...(await getMultipleAccountsInfo(keys.slice(start, start + BATCH))),
    );
  }

  return indexes.flatMap((index, i) => {
    const proposal = accounts[2 * i];
    const transaction = accounts[2 * i + 1];
    if (!proposal || !transaction || !isVaultTransaction(transaction))
      return [];

    const status =
      multisig.accounts.Proposal.fromAccountInfo(proposal)[0].status.__kind;
    if (!PENDING_STATUSES.includes(status)) return [];

    const [{ message }] =
      multisig.accounts.VaultTransaction.fromAccountInfo(transaction);
    const buffer = upgradeBuffer(message, programId);
    return buffer ? [{ index, status, buffer }] : [];
  });
};

/**
 * Split pending proposals by the buffer this run reuses. With no reused buffer
 * the run writes a new one, so every pending proposal is an older release.
 */
export const classifyPending = (pending, buffer) => {
  const same = buffer ? pending.find((p) => p.buffer === buffer) : undefined;
  return {
    sameBuffer: same ? same.index : null,
    older: pending.filter((p) => p !== same).map((p) => p.index),
  };
};

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    const value = argv[i + 1];
    if (
      !["--multisig", "--program-id", "--buffer"].includes(name) ||
      value === undefined
    ) {
      throw new Error(USAGE);
    }
    args[name.slice(2)] = value;
  }
  if (!args.multisig || !args["program-id"]) throw new Error(USAGE);
  return args;
};

const main = async () => {
  // The RPC URL is a secret, so it comes from the environment and never from argv.
  const url = process.env.SOLANA_URL;
  try {
    if (!url) throw new Error(USAGE);
    const args = parseArgs(process.argv.slice(2));
    const connection = new Connection(url, "confirmed");
    const pending = await pendingUpgrades({
      getMultipleAccountsInfo: (keys) =>
        connection.getMultipleAccountsInfo(keys),
      multisigPda: new PublicKey(args.multisig),
      programId: new PublicKey(args["program-id"]),
    });
    console.log(
      JSON.stringify({ pending, ...classifyPending(pending, args.buffer) }),
    );
  } catch (error) {
    // web3.js puts the RPC URL in some errors.
    const message = String(error?.message ?? error);
    console.error(url ? message.replaceAll(url, "<rpc-url>") : message);
    process.exit(1);
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
