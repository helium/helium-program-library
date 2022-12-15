use crate::error::*;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CloseDepositEntry<'info> {
    // checking the PDA address it just an extra precaution,
    // the other constraints must be exhaustive
    #[account(
        mut,
        seeds = [voter.load()?.registrar.key().as_ref(), b"voter".as_ref(), voter_authority.key().as_ref()],
        bump = voter.load()?.voter_bump,
        has_one = voter_authority)]
    pub voter: AccountLoader<'info, Voter>,
    pub voter_authority: Signer<'info>,
}

/// Close an empty deposit entry, allowing it to be reused in the future.
///
/// Deposit entries can only be closed when they don't hold any tokens.
pub fn close_deposit_entry(ctx: Context<CloseDepositEntry>, deposit_entry_index: u8) -> Result<()> {
    let voter = &mut ctx.accounts.voter.load_mut()?;
    let d = voter.active_deposit_mut(deposit_entry_index)?;
    require_eq!(d.amount_deposited_native, 0, VsrError::VotingTokenNonZero);

    *d = DepositEntry::default();
    d.is_used = false;

    Ok(())
}
