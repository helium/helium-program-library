use crate::{current_epoch, error::ErrorCode, state::*, update_subdao_vehnt, TESTING};
use anchor_lang::prelude::*;
use voter_stake_registry::state::{Registrar, Voter};

#[derive(Accounts)]
pub struct PurgePositionV0<'info> {
  #[account(
    mut,
    seeds = [registrar.key().as_ref(), b"voter".as_ref(), voter_authority.key().as_ref()],
    seeds::program = vsr_program.key(),
    bump,
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
  pub stake_position: Account<'info, StakePositionV0>,

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

  ///CHECK: constraints
  #[account(address = voter_stake_registry::ID)]
  pub vsr_program: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<PurgePositionV0>) -> Result<()> {
  // load the vehnt information
  let voter = ctx.accounts.vsr_voter.load()?;
  let registrar = &ctx.accounts.registrar.load()?;
  let d_entry = voter.deposits[ctx.accounts.stake_position.deposit_entry_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  if !TESTING && !d_entry.lockup.expired(curr_ts) {
    return Err(error!(ErrorCode::LockupNotExpired));
  }
  if ctx.accounts.stake_position.purged {
    return Err(error!(ErrorCode::PositionAlreadyPurged));
  }
  let time_since_expiry = d_entry.lockup.seconds_since_expiry(curr_ts);

  let sub_dao = &mut ctx.accounts.sub_dao;
  update_subdao_vehnt(sub_dao, curr_ts);
  sub_dao.vehnt_fall_rate -= ctx.accounts.stake_position.fall_rate;
  sub_dao.vehnt_staked += ctx
    .accounts
    .stake_position
    .fall_rate
    .checked_mul(time_since_expiry)
    .unwrap();
  ctx.accounts.stake_position.purged = true;
  Ok(())
}
