use crate::error::*;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InternalTransferUnlocked<'info> {
    pub registrar: AccountLoader<'info, Registrar>,

    // checking the PDA address it just an extra precaution,
    // the other constraints must be exhaustive
    #[account(
        mut,
        seeds = [registrar.key().as_ref(), b"voter".as_ref(), voter_authority.key().as_ref()],
        bump = voter.load()?.voter_bump,
        has_one = voter_authority,
        has_one = registrar)]
    pub voter: AccountLoader<'info, Voter>,
    pub voter_authority: Signer<'info>,
}

/// Transfers unlocked tokens from the source deposit entry to the target deposit entry.
///
/// Note that this never transfers locked tokens, only tokens that are unlocked.
///
/// The primary usecase is moving some deposited funds from one deposit entry to
/// another because the user wants to lock them, without having to withdraw and re-deposit
/// them.
pub fn internal_transfer_unlocked(
    ctx: Context<InternalTransferUnlocked>,
    source_deposit_entry_index: u8,
    target_deposit_entry_index: u8,
    amount: u64,
) -> Result<()> {
    let registrar = &ctx.accounts.registrar.load()?;
    let voter = &mut ctx.accounts.voter.load_mut()?;
    let curr_ts = registrar.clock_unix_timestamp();

    let source = voter.active_deposit_mut(source_deposit_entry_index)?;
    let source_mint_idx = source.voting_mint_config_idx;

    // Reduce source amounts
    require_gte!(
        source.amount_unlocked(curr_ts),
        amount,
        VsrError::InsufficientUnlockedTokens
    );
    source.amount_deposited_native = source.amount_deposited_native.checked_sub(amount).unwrap();

    // Check target compatibility
    let target = voter.active_deposit_mut(target_deposit_entry_index)?;
    require_eq!(
        target.voting_mint_config_idx,
        source_mint_idx,
        VsrError::InvalidMint
    );

    // Add target amounts
    target.amount_deposited_native = target.amount_deposited_native.checked_add(amount).unwrap();

    Ok(())
}
