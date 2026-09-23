/**
 * Which pending Squads v4 proposals upgrade one program.
 *
 * A deploy re-run reads this before it makes a proposal. A pending proposal that
 * already names the buffer the run reuses means there is nothing to do. A pending
 * proposal on another buffer is an older release; signers reject it, so the run
 * reports its index.
 *
 * Pending is Approved at any index, or Active above the multisig's stale
 * transaction index. An Approved vault transaction still executes after it goes
 * stale; a stale Active proposal can no longer be approved.
 */
import { pathToFileURL } from "node:url";

import { Connection, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const USAGE =
  "Usage: SOLANA_URL=<rpc> node scripts/pending-upgrade-proposals.mjs --multisig <address> --program-id <address> --spill <address> [--buffer <address>]";

const BPF_LOADER_UPGRADEABLE = "BPFLoaderUpgradeab1e11111111111111111111111";
// The loader's Upgrade instruction: a u32 LE enum tag and nothing else.
// Accounts: programData, program, buffer, spill, rent, clock, authority.
const UPGRADE_DATA = Buffer.from([3, 0, 0, 0]);
// Anchor's IDL instruction tag: sha256("anchor:idl")[..8] as a LE u64.
const IDL_IX_TAG = Buffer.from([
  0x40, 0xf4, 0xbc, 0x78, 0xa7, 0xe9, 0x69, 0x0a,
]);
// The IDL instruction variant byte after the tag. Account 2 is SetBuffer's
// authority and Close's sol_destination.
const IDL_SET_BUFFER = 3;
const IDL_SET_AUTHORITY = 4;
const IDL_CLOSE = 5;
// The `getMultipleAccounts` limit.
const BATCH = 100;

const isVaultTransaction = (account) =>
  Buffer.from(multisig.accounts.vaultTransactionDiscriminator).equals(
    account.data.subarray(0, 8),
  );

/**
 * The buffer a vault transaction upgrades `programId` from, or null, and
 * whether its message is exactly the upgrade this workflow builds: only the
 * loader Upgrade (programData, program, buffer, spill, ..., vault) and IDL
 * instructions to the program. An IDL SetAuthority, or a SetBuffer or Close
 * that does not keep the IDL and its rent with the vault, is not this upgrade.
 */
const upgradeBuffer = (message, programId, multisigPda, spill) => {
  const key = (index) => message.accountKeys[index]?.toBase58();
  const isUpgrade = (ix) =>
    key(ix.programIdIndex) === BPF_LOADER_UPGRADEABLE &&
    UPGRADE_DATA.equals(Buffer.from(ix.data)) &&
    key(ix.accountIndexes[1]) === programId.toBase58();
  const upgrade = message.instructions.find(isUpgrade);
  const buffer = upgrade ? (key(upgrade.accountIndexes[2]) ?? null) : null;
  if (!buffer) return { buffer: null, exact: false };

  const programData = PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    new PublicKey(BPF_LOADER_UPGRADEABLE),
  )[0].toBase58();
  const vault = multisig.getVaultPda({ multisigPda, index: 0 })[0].toBase58();
  const isExactIdl = (ix) => {
    const data = Buffer.from(ix.data);
    if (
      key(ix.programIdIndex) !== programId.toBase58() ||
      !IDL_IX_TAG.equals(data.subarray(0, 8))
    ) {
      return false;
    }
    const variant = data[8];
    if (variant === IDL_SET_AUTHORITY) return false;
    if (variant === IDL_SET_BUFFER || variant === IDL_CLOSE) {
      return key(ix.accountIndexes[2]) === vault;
    }
    return true;
  };
  const exact = message.instructions.every(
    (ix) =>
      (isUpgrade(ix) &&
        key(ix.accountIndexes[0]) === programData &&
        key(ix.accountIndexes[2]) === buffer &&
        key(ix.accountIndexes[3]) === spill.toBase58() &&
        key(ix.accountIndexes[6]) === vault) ||
      isExactIdl(ix),
  );
  return { buffer, exact };
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
  spill,
}) => {
  const [multisigAccount] = await getMultipleAccountsInfo([multisigPda]);
  if (!multisigAccount) {
    throw new Error(`multisig account ${multisigPda.toBase58()} not found`);
  }
  const [{ transactionIndex, staleTransactionIndex }] =
    multisig.accounts.Multisig.fromAccountInfo(multisigAccount);

  const indexes = [];
  for (let index = 1; index <= Number(transactionIndex); index++) {
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
    const pendingStatus =
      status === "Approved" ||
      (status === "Active" && index > Number(staleTransactionIndex));
    if (!pendingStatus) return [];

    const [{ message }] =
      multisig.accounts.VaultTransaction.fromAccountInfo(transaction);
    const { buffer, exact } = upgradeBuffer(
      message,
      programId,
      multisigPda,
      spill,
    );
    return buffer ? [{ index, status, buffer, exact }] : [];
  });
};

/**
 * Split pending proposals by the buffer this run reuses. With no reused buffer
 * the run writes a new one, so every pending proposal is an older release. A
 * proposal on the reused buffer that is not exactly this workflow's upgrade is
 * an older one too.
 */
export const classifyPending = (pending, buffer) => {
  const same = buffer
    ? pending.find((p) => p.buffer === buffer && p.exact)
    : undefined;
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
      !["--multisig", "--program-id", "--spill", "--buffer"].includes(name) ||
      value === undefined
    ) {
      throw new Error(USAGE);
    }
    args[name.slice(2)] = value;
  }
  if (!args.multisig || !args["program-id"] || !args.spill) {
    throw new Error(USAGE);
  }
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
      spill: new PublicKey(args.spill),
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
