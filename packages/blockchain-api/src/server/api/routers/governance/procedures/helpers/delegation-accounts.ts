import {
  EPOCH_LENGTH,
  PROGRAM_ID as HSD_PROGRAM_ID,
} from "@helium/helium-sub-daos-sdk";
import { PROGRAM_ID as VSR_PROGRAM_ID } from "@helium/voter-stake-registry-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";

/**
 * Every account the delegation instructions need, so they can be built with
 * `accountsStrict` and Anchor's resolvers never run. The resolvers in
 * `@helium/helium-sub-daos-sdk` re-fetch the VSR, sub-DAO and NFT-proxy IDLs
 * plus the position, delegated position, registrar, proxy config and clock on
 * every unresolved epoch-info account, which is 20-40 sequential RPC round
 * trips per position.
 *
 * The epoch-info seeds mirror `programs/helium-sub-daos/src/instructions/
 * delegation/*.rs` exactly; a mismatch is a `ConstraintSeeds` failure.
 */
export interface DelegationAccountsArgs {
  /** Payer, position authority, and owner of the position token account. */
  wallet: PublicKey;
  position: PublicKey;
  positionMint: PublicKey;
  /** `position.lockup.effective_end_ts()`, from `lockupEffectiveEndTs`. */
  lockupEndTs: BN;
  /** `position.genesis_end`. */
  genesisEndTs: BN;
  registrar: PublicKey;
  /** `registrar.proxy_config`. */
  proxyConfig: PublicKey;
  /** `registrar.dao`, as carried by `sub_dao.dao`. */
  dao: PublicKey;
  delegatedPosition: PublicKey;
  subDao: PublicKey;
  /**
   * The cluster clock's `unix_timestamp`. The program reads
   * `registrar.clock_unix_timestamp()`, which adds `registrar.time_offset` —
   * a test-only dial that is zero on mainnet, so the two agree there.
   */
  now: BN;
}

/**
 * `get_closing_epoch_bytes` in close_delegation_v0.rs: an existing delegation
 * closes at whichever comes first, the lockup end or the expiration it was
 * delegated to. `expiration_ts == 0` means it never expires.
 */
const closingTsFromExpiration = (lockupEndTs: BN, expirationTs: BN): BN =>
  expirationTs.isZero() ? lockupEndTs : BN.min(lockupEndTs, expirationTs);

/**
 * `get_closing_epoch_bytes` in delegate_v0.rs: a new or re-delegated position
 * closes at whichever comes first, the lockup end or the current season end.
 */
const closingTsFromSeason = (lockupEndTs: BN, seasonEndTs: BN): BN =>
  BN.min(lockupEndTs, seasonEndTs);

/**
 * `get_genesis_end_epoch_bytes`: once the genesis piece is purged the program
 * takes the closing-time epoch info instead of a separate account, so account
 * deduplication shrinks the transaction.
 */
const genesisEndTsOrClosing = (genesisEndTs: BN, now: BN, closingTs: BN): BN =>
  genesisEndTs.lte(now) ? closingTs : genesisEndTs;

const sharedAccounts = (args: DelegationAccountsArgs) => ({
  payer: args.wallet,
  position: args.position,
  mint: args.positionMint,
  positionTokenAccount: getAssociatedTokenAddressSync(
    args.positionMint,
    args.wallet,
    true,
  ),
  registrar: args.registrar,
  dao: args.dao,
  subDao: args.subDao,
  delegatedPosition: args.delegatedPosition,
  systemProgram: SystemProgram.programId,
});

/** `i64::MAX`, the end a lockup that never unlocks reports. */
const I64_MAX = new BN("9223372036854775807");

/**
 * `Lockup::effective_end_ts` in voter-stake-registry's state.rs: a constant
 * lockup has no end, so the program uses `i64::MAX`. The SDK's
 * `getLockupEffectiveEndTs` narrows that to `Number.MAX_SAFE_INTEGER - 1`,
 * which sits in a different epoch and fails the seeds check.
 */
export const lockupEffectiveEndTs = (lockup: {
  kind: object;
  endTs: BN;
}): BN =>
  (Object.keys(lockup.kind)[0] as string) === "constant"
    ? I64_MAX
    : lockup.endTs;

/**
 * The `sub_dao_epoch_info` PDA. The epoch comes from BN division rather than
 * `subDaoEpochInfoKey`, whose `currentEpoch` narrows the timestamp through
 * `BN.toNumber()` and throws on the `i64::MAX` a constant lockup carries.
 */
const epochInfo = (subDao: PublicKey, ts: BN) => {
  const epochSeed = Buffer.alloc(8);
  epochSeed.writeBigUInt64LE(
    BigInt(ts.div(new BN(EPOCH_LENGTH)).toString(10)),
  );
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sub_dao_epoch_info", "utf-8"), subDao.toBuffer(), epochSeed],
    HSD_PROGRAM_ID,
  )[0];
};

export function closeDelegationAccounts(
  args: DelegationAccountsArgs & {
    /** `delegated_position.expiration_ts`. */
    expirationTs: BN;
  },
) {
  const closingTs = closingTsFromExpiration(
    args.lockupEndTs,
    args.expirationTs,
  );

  return {
    ...sharedAccounts(args),
    positionAuthority: args.wallet,
    subDaoEpochInfo: epochInfo(args.subDao, args.now),
    closingTimeSubDaoEpochInfo: epochInfo(args.subDao, closingTs),
    genesisEndSubDaoEpochInfo: epochInfo(
      args.subDao,
      genesisEndTsOrClosing(args.genesisEndTs, args.now, closingTs),
    ),
    vsrProgram: VSR_PROGRAM_ID,
  };
}

export function delegateAccounts(
  args: DelegationAccountsArgs & {
    /** End of the proxy config season containing `now`. */
    seasonEndTs: BN;
  },
) {
  const closingTs = closingTsFromSeason(args.lockupEndTs, args.seasonEndTs);

  return {
    ...sharedAccounts(args),
    positionAuthority: args.wallet,
    subDaoEpochInfo: epochInfo(args.subDao, args.now),
    closingTimeSubDaoEpochInfo: epochInfo(args.subDao, closingTs),
    genesisEndSubDaoEpochInfo: epochInfo(
      args.subDao,
      genesisEndTsOrClosing(args.genesisEndTs, args.now, closingTs),
    ),
    vsrProgram: VSR_PROGRAM_ID,
    proxyConfig: args.proxyConfig,
  };
}

export function changeDelegationAccounts(
  args: DelegationAccountsArgs & {
    /** `delegated_position.sub_dao`, the sub-DAO being moved away from. */
    oldSubDao: PublicKey;
    expirationTs: BN;
    seasonEndTs: BN;
  },
) {
  const oldClosingTs = closingTsFromExpiration(
    args.lockupEndTs,
    args.expirationTs,
  );
  const closingTs = closingTsFromSeason(args.lockupEndTs, args.seasonEndTs);

  return {
    ...sharedAccounts(args),
    positionAuthority: args.wallet,
    oldSubDao: args.oldSubDao,
    oldSubDaoEpochInfo: epochInfo(args.oldSubDao, args.now),
    oldClosingTimeSubDaoEpochInfo: epochInfo(args.oldSubDao, oldClosingTs),
    oldGenesisEndSubDaoEpochInfo: epochInfo(
      args.oldSubDao,
      genesisEndTsOrClosing(args.genesisEndTs, args.now, oldClosingTs),
    ),
    subDaoEpochInfo: epochInfo(args.subDao, args.now),
    closingTimeSubDaoEpochInfo: epochInfo(args.subDao, closingTs),
    genesisEndSubDaoEpochInfo: epochInfo(
      args.subDao,
      genesisEndTsOrClosing(args.genesisEndTs, args.now, closingTs),
    ),
    vsrProgram: VSR_PROGRAM_ID,
    proxyConfig: args.proxyConfig,
  };
}

export function extendExpirationAccounts(
  args: DelegationAccountsArgs & {
    expirationTs: BN;
    seasonEndTs: BN;
  },
) {
  const oldClosingTs = closingTsFromExpiration(
    args.lockupEndTs,
    args.expirationTs,
  );
  const closingTs = closingTsFromSeason(args.lockupEndTs, args.seasonEndTs);

  // No `position_authority` or `vsr_program`: extend_expiration_ts_v0 checks
  // the signer against `position_token_account.owner` directly.
  return {
    ...sharedAccounts(args),
    authority: args.wallet,
    oldClosingTimeSubDaoEpochInfo: epochInfo(args.subDao, oldClosingTs),
    closingTimeSubDaoEpochInfo: epochInfo(args.subDao, closingTs),
    genesisEndSubDaoEpochInfo: epochInfo(
      args.subDao,
      genesisEndTsOrClosing(args.genesisEndTs, args.now, closingTs),
    ),
    proxyConfig: args.proxyConfig,
  };
}
