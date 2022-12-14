use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateVoterWeightRecord<'info> {
    pub registrar: AccountLoader<'info, Registrar>,

    // checking the PDA address it just an extra precaution,
    // the other constraints must be exhaustive
    #[account(
        seeds = [registrar.key().as_ref(), b"voter".as_ref(), voter.load()?.voter_authority.key().as_ref()],
        bump = voter.load()?.voter_bump,
        has_one = registrar)]
    pub voter: AccountLoader<'info, Voter>,

    #[account(
        mut,
        seeds = [registrar.key().as_ref(), b"voter-weight-record".as_ref(), voter.load()?.voter_authority.key().as_ref()],
        bump = voter.load()?.voter_weight_record_bump,
        constraint = voter_weight_record.realm == registrar.load()?.realm,
        constraint = voter_weight_record.governing_token_owner == voter.load()?.voter_authority,
        constraint = voter_weight_record.governing_token_mint == registrar.load()?.realm_governing_token_mint,
    )]
    pub voter_weight_record: Account<'info, VoterWeightRecord>,

    pub system_program: Program<'info, System>,
}

/// Calculates the lockup-scaled, time-decayed voting power for the given
/// voter and writes it into a `VoteWeightRecord` account to be used by
/// the SPL governance program.
///
/// This "revise" instruction must be called immediately before voting, in
/// the same transaction.
pub fn update_voter_weight_record(ctx: Context<UpdateVoterWeightRecord>) -> Result<()> {
    let registrar = &ctx.accounts.registrar.load()?;
    let voter = ctx.accounts.voter.load()?;
    let record = &mut ctx.accounts.voter_weight_record;
    record.voter_weight = voter.weight(registrar)?;
    record.voter_weight_expiry = Some(Clock::get()?.slot);

    Ok(())
}
