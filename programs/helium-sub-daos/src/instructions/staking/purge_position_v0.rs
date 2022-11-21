use crate::{current_epoch, error::ErrorCode, state::*, utils::*};
use anchor_lang::prelude::*;
use voter_stake_registry::state::{Registrar, Voter};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct PurgePositionArgsV0 {}

#[derive(Accounts)]
#[instruction(args: PurgePositionArgsV0)]
pub struct PurgePositionV0<'info> {
  #[account(
    mut,
    seeds = [vsr_voter.load()?.registrar.key().as_ref(), b"voter".as_ref(), voter_authority.key().as_ref()],
    bump = vsr_voter.load()?.voter_bump,
    has_one = voter_authority,
    has_one = registrar,
  )]
  pub vsr_voter: AccountLoader<'info, Voter>,
  #[account(mut)]
  pub voter_authority: Signer<'info>,
  pub registrar: AccountLoader<'info, Registrar>,

  #[account(
    mut,
    seeds = ["stake_position".as_bytes(), voter_authority.key().as_ref(), &[stake_position.deposit_entry_idx]],
    bump,
  )]
  pub stake_position: Account<'info, StakePosition>,

  #[account(mut)]
  pub sub_dao: Account<'info, SubDaoV0>,
  #[account(
    init_if_needed,
    payer = voter_authority,
    space = 60 + 8 + std::mem::size_of::<SubDaoEpochInfoV0>(),
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &current_epoch(clock.unix_timestamp).to_le_bytes()], // Break into 30m epochs
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,

  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<PurgePositionV0>, args: PurgePositionArgsV0) -> Result<()> {
  // load the vehnt information
  let voter = ctx.accounts.vsr_voter.load()?;
  let registrar = &ctx.accounts.registrar.load()?;
  let d_entry = voter.deposits[ctx.accounts.stake_position.deposit_entry_idx as usize];
  let voting_mint_config = &registrar.voting_mints[d_entry.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  if !d_entry.lockup.expired(curr_ts) {
    error!(ErrorCode::LockupNotExpired);
  }
  if ctx.accounts.stake_position.purged {
    error!(ErrorCode::PositionAlreadyPurged);
  }
  let time_since_expiry = d_entry.lockup.seconds_since_expiry(curr_ts);

  ctx.accounts.sub_dao.vehnt_fall_rate -= ctx.accounts.stake_position.fall_rate;
  ctx.accounts.sub_dao.vehnt_staked += ctx
    .accounts
    .stake_position
    .fall_rate
    .checked_mul(time_since_expiry)
    .unwrap();
  ctx.accounts.stake_position.purged = true;
  Ok(())
}
