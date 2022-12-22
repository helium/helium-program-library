use crate::{create_cron, error::ErrorCode, state::*, update_subdao_vehnt, TESTING};
use anchor_lang::prelude::*;
use clockwork_sdk::{
  cpi::thread_update,
  state::{Thread, ThreadSettings, Trigger},
  ThreadProgram,
};
use voter_stake_registry::state::{Voter};

#[derive(Accounts)]
pub struct PurgePositionV0<'info> {
  #[account(
    seeds = [b"voter".as_ref(), vsr_voter.load()?.mint.as_ref()],
    seeds::program = vsr_program.key(),
    bump = vsr_voter.load()?.voter_bump,
  )]
  pub vsr_voter: AccountLoader<'info, Voter>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,

  #[account(
    mut,
    has_one = sub_dao
  )]
  pub stake_position: Account<'info, StakePositionV0>,

  ///CHECK: constraints
  #[account(address = voter_stake_registry::ID)]
  pub vsr_program: AccountInfo<'info>,

  pub system_program: Program<'info, System>,
  #[account(mut, address = Thread::pubkey(stake_position.key(), format!("purge-{:?}", stake_position.deposit)))]
  pub thread: Account<'info, Thread>,
  pub clockwork: Program<'info, ThreadProgram>,
  pub clock: Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<PurgePositionV0>) -> Result<()> {
  // load the vehnt information
  let voter = ctx.accounts.vsr_voter.load()?;
  let d_entry = voter.deposits[ctx.accounts.stake_position.deposit as usize];
  let curr_ts = ctx.accounts.clock.unix_timestamp;
  if !TESTING && !d_entry.lockup.expired(curr_ts) {
    // update the thread to make sure it's tracking the right lockup. this case can happen if user increases their vsr lockup period
    let signer_seeds: &[&[&[u8]]] = &[&[
      "stake_position".as_bytes(),
      ctx.accounts.stake_position.mint.as_ref(),
      &ctx.accounts.stake_position.deposit.to_le_bytes(),
      &[ctx.bumps["stake_position"]],
    ]];
    let seconds_until_expiry = d_entry.lockup.seconds_left(curr_ts);
    let expiry_ts = curr_ts
      .checked_add(seconds_until_expiry.try_into().unwrap())
      .unwrap();
    let cron = create_cron(expiry_ts, (60 * 60).try_into().unwrap());
    thread_update(
      CpiContext::new_with_signer(
        ctx.accounts.clockwork.to_account_info(),
        clockwork_sdk::cpi::ThreadUpdate {
          authority: ctx.accounts.stake_position.to_account_info(),
          system_program: ctx.accounts.system_program.to_account_info(),
          thread: ctx.accounts.thread.to_account_info(),
        },
        signer_seeds,
      ),
      ThreadSettings {
        fee: None,
        kickoff_instruction: None,
        rate_limit: None,
        trigger: Some(Trigger::Cron {
          schedule: cron,
          skippable: false,
        }),
      },
    )?;
    return Ok(());
  }

  if ctx.accounts.stake_position.purged {
    return Err(error!(ErrorCode::PositionAlreadyPurged));
  }
  let time_since_expiry = d_entry.lockup.seconds_since_expiry(curr_ts);

  let stake_position = &mut ctx.accounts.stake_position;
  let sub_dao = &mut ctx.accounts.sub_dao;

  update_subdao_vehnt(sub_dao, curr_ts);
  sub_dao.vehnt_fall_rate -= stake_position.fall_rate;
  sub_dao.vehnt_staked += stake_position
    .fall_rate
    .checked_mul(time_since_expiry)
    .unwrap();
  stake_position.purged = true;

  Ok(())
}
