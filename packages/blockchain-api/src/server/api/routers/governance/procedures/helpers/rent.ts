import { HNT_MINT } from "@helium/spl-utils";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { RENT_COSTS } from "@/lib/utils/balance-validation";

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
