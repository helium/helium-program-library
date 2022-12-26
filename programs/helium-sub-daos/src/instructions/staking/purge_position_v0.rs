use crate::{create_cron, error::ErrorCode, state::*, update_subdao_vehnt, TESTING, FALL_RATE_FACTOR};
use anchor_lang::prelude::*;
use clockwork_sdk::{
  cpi::thread_update,
  state::{Thread, ThreadSettings, Trigger},
  ThreadProgram,
};
use voter_stake_registry::state::{PositionV0, Registrar};

#[derive(Accounts)]
pub struct PurgePositionV0<'info> {
  #[account(
    has_one = registrar
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub registrar: AccountLoader<'info, Registrar>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,

  #[account(
    mut,
    has_one = sub_dao,
    has_one = position,
    seeds = [b"stake_position", position.key().as_ref()],
    bump = stake_position.bump_seed
  )]
  pub stake_position: Account<'info, StakePositionV0>,

  ///CHECK: constraints
  #[account(address = voter_stake_registry::ID)]
  pub vsr_program: AccountInfo<'info>,

  pub system_program: Program<'info, System>,
  #[account(
    mut,
    seeds = [b"thread", stake_position.key().as_ref(), b"purge"],
    seeds::program = clockwork.key(),
    bump
  )]
  pub thread: Account<'info, Thread>,
  pub clockwork: Program<'info, ThreadProgram>,
  pub clock: Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<PurgePositionV0>) -> Result<()> {
  // load the vehnt information
  let position = &mut ctx.accounts.position;
  let curr_ts  = ctx.accounts.registrar.load()?.clock_unix_timestamp();
  if !position.lockup.expired(curr_ts) {
    // update the thread to make sure it's tracking the right lockup. this case can happen if user increases their vsr lockup period
    let signer_seeds: &[&[&[u8]]] = &[&[
      "stake_position".as_bytes(),
      ctx.accounts.stake_position.position.as_ref(),
      &[ctx.accounts.stake_position.bump_seed],
    ]];
    let seconds_until_expiry = position.lockup.seconds_left(curr_ts);
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
  let time_since_expiry = position.lockup.seconds_since_expiry(curr_ts);

  let stake_position = &mut ctx.accounts.stake_position;
  let sub_dao = &mut ctx.accounts.sub_dao;

  update_subdao_vehnt(sub_dao, curr_ts);
  sub_dao.vehnt_fall_rate = sub_dao.vehnt_fall_rate.checked_sub(stake_position.fall_rate).unwrap();
  sub_dao.vehnt_staked = sub_dao.vehnt_staked.checked_add(
    stake_position
      .fall_rate
      .checked_mul(u128::from(time_since_expiry))
      .unwrap()
      .checked_div(FALL_RATE_FACTOR)
      .unwrap()
      .try_into()
      .unwrap()
  ).unwrap();
  stake_position.purged = true;

  Ok(())
}
