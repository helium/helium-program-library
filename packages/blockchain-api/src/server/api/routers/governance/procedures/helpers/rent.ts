import { HNT_MINT } from "@helium/spl-utils";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { RENT_COSTS } from "@/lib/utils/balance-validation";
import { getMultipleAccounts } from "./build-claim-instructions";

/**
 * Space `init_delegation_claim_bot_v0` allocates for a DelegationClaimBotV0:
 * `8 + 60 + DelegationClaimBotV0::INIT_SPACE` (see
 * programs/hpl-crons/src/instructions/init_delegation_claim_bot_v0.rs; the
 * struct in programs/hpl-crons/src/state.rs is 138 bytes). The IDL-derived
 * `.size` Anchor reports is 8 + 138 — it omits the 60-byte header the program
 * reserves, so pricing rent off it under-quotes the wallet by 60 bytes.
 */
export const DELEGATION_CLAIM_BOT_SPACE = 8 + 60 + 138;

/**
 * Space `delegate_v0` allocates for a DelegatedPositionV0:
 * `60 + 8 + std::mem::size_of::<DelegatedPositionV0>()` (see
 * programs/helium-sub-daos/src/instructions/delegation/delegate_v0.rs; the
 * struct in programs/helium-sub-daos/src/state.rs lays out to 176 bytes, its
 * u128 bitmap forcing 16-byte alignment). Anchor's IDL-derived `.size` is the
 * 158-byte borsh encoding, which under-quotes the wallet by 86 bytes.
 */
export const DELEGATED_POSITION_SPACE = 60 + 8 + 176;

/**
 * Space `initialize_position_v0` allocates for a PositionV0:
 * `8 + std::mem::size_of::<PositionV0>() + 60` (see
 * programs/voter-stake-registry/src/instructions/initialize_position_v0.rs; the
 * struct in programs/voter-stake-registry/src/state/position.rs lays out to 176
 * bytes). Anchor's IDL-derived `.size` is the 153-byte borsh encoding of an
 * empty `recent_proposals`, which under-quotes the wallet by 91 bytes.
 */
export const POSITION_SPACE = 8 + 176 + 60;

/**
 * Space `sub_dao_epoch_info` accounts are opened with in `delegate_v0`:
 * `SubDaoEpochInfoV0::SIZE` (programs/helium-sub-daos/src/state.rs). Both the
 * current-epoch and closing-time accounts are `init_if_needed` with the wallet
 * as payer, so a first delegation into an epoch nobody has touched pays for
 * them. Mainnet accounts read back at 204 bytes.
 */
export const SUB_DAO_EPOCH_INFO_SPACE = 204;

/**
 * Space Metaplex allocates for the token metadata `initialize_position_v0`
 * creates alongside the position NFT, plus the flat fee Token Metadata has
 * charged on create since v1.10. Neither is derivable from an IDL in this
 * repo; both are the values the accounts and the wallet actually move on
 * mainnet (metadata reads back at 607 bytes).
 */
export const TOKEN_METADATA_SPACE = 607;
export const TOKEN_METADATA_CREATE_FEE = 0.01 * LAMPORTS_PER_SOL;

/**
 * Space tuktuk allocates for the task `start_delegation_claim_bot_v1` queues.
 * `queue_task_v0` sizes a TaskV0 from the serialized transaction it carries, so
 * this is specific to the delegation-claim task and is not the size behind
 * `RENT_COSTS.TUKTUK_TASK` (that one is the mini-fanout task). Queued tasks
 * also carry the task queue's `minCrankReward` on top of rent.
 */
export const DELEGATION_CLAIM_TASK_SPACE = 877;

/**
 * Rent the delegation-automation instructions charge the wallet on top of the
 * delegation itself: one claim-bot account per position that does not already
 * have one, plus the delegator's HNT ATA when the caller emits the idempotent
 * create for it and the account is still missing.
 */
export async function getAutomationRentLamports({
  connection,
  walletPubkey,
  newClaimBots,
  createsHntAta,
}: {
  connection: Connection;
  walletPubkey: PublicKey;
  newClaimBots: number;
  createsHntAta: boolean;
}): Promise<number> {
  if (newClaimBots === 0 && !createsHntAta) return 0;

  const [claimBotRent, hntAtaInfo] = await Promise.all([
    newClaimBots > 0
      ? connection.getMinimumBalanceForRentExemption(DELEGATION_CLAIM_BOT_SPACE)
      : Promise.resolve(0),
    createsHntAta
      ? connection.getAccountInfo(
          getAssociatedTokenAddressSync(HNT_MINT, walletPubkey, true),
        )
      : Promise.resolve(null),
  ]);

  return (
    newClaimBots * claimBotRent +
    (createsHntAta && !hntAtaInfo ? RENT_COSTS.ATA : 0)
  );
}

/**
 * Rent for the `sub_dao_epoch_info` accounts `delegate_v0` opens on demand. The
 * epoch a wallet delegates into is usually already funded by an earlier
 * delegator, so charge only for the ones that are still missing.
 */
export async function getMissingEpochInfoRentLamports({
  connection,
  epochInfoKeys,
}: {
  connection: Connection;
  epochInfoKeys: PublicKey[];
}): Promise<number> {
  if (epochInfoKeys.length === 0) return 0;

  // The current-epoch and end-epoch keys coincide for a position closing in the
  // epoch it is delegated in, and the wallet only pays for that account once.
  const uniqueKeys = [
    ...new Map(epochInfoKeys.map((key) => [key.toBase58(), key])).values(),
  ];

  const [infos, rent] = await Promise.all([
    getMultipleAccounts(connection, uniqueKeys),
    connection.getMinimumBalanceForRentExemption(SUB_DAO_EPOCH_INFO_SPACE),
  ]);

  return infos.filter((info) => info === null).length * rent;
}
