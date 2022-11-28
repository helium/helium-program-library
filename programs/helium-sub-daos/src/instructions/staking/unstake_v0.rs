use crate::{current_epoch, state::*, update_subdao_vehnt};
use anchor_lang::prelude::*;
use clockwork_sdk::thread_program::{self, accounts::Thread, cpi::thread_delete, ThreadProgram};
use voter_stake_registry::state::{Registrar, Voter};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UnstakeArgsV0 {
  pub deposit_entry_idx: u8,
}

#[derive(Accounts)]
#[instruction(args: UnstakeArgsV0)]
pub struct UnstakeV0<'info> {
  #[account(
    mut,
    seeds = [registrar.key().as_ref(), b"voter".as_ref(), voter_authority.key().as_ref()],
    seeds::program = vsr_program.key(),
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
    close = voter_authority,
    seeds = ["stake_position".as_bytes(), voter_authority.key().as_ref(), &[args.deposit_entry_idx]],
    bump
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

  #[account(mut, address = Thread::pubkey(stake_position.key(), format!("purge-{:?}", args.deposit_entry_idx).into()))]
  pub thread: SystemAccount<'info>,
  #[account(address = thread_program::ID)]
  pub clockwork: Program<'info, ThreadProgram>,
}

pub fn handler(ctx: Context<UnstakeV0>, args: UnstakeArgsV0) -> Result<()> {
  // TODO currently this will unstake the whole amount, add ability to partially unstake and reduce fallrate of position

  // load the vehnt information
  let voter = ctx.accounts.vsr_voter.load()?;
  let registrar = &ctx.accounts.registrar.load()?;
  let d_entry = voter.deposits[args.deposit_entry_idx as usize];
  let voting_mint_config = &registrar.voting_mints[d_entry.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  let available_vehnt = d_entry.voting_power(voting_mint_config, curr_ts)?;

  // don't allow unstake without claiming available rewards
  let curr_epoch = current_epoch(ctx.accounts.clock.unix_timestamp);
  assert!(ctx.accounts.stake_position.last_claimed_epoch >= curr_epoch - 1);
  assert!(ctx.accounts.stake_position.hnt_amount <= d_entry.amount_deposited_native);

  // position_vehnt = available_vehnt * hnt_amount / amount_deposited_native
  let position_vehnt = available_vehnt
    .checked_mul(ctx.accounts.stake_position.hnt_amount)
    .unwrap()
    .checked_div(d_entry.amount_deposited_native)
    .unwrap();

  let sub_dao = &mut ctx.accounts.sub_dao;
  update_subdao_vehnt(sub_dao, curr_ts);

  // remove this StakePositionV0 information from the subdao and epoch
  sub_dao.vehnt_staked = sub_dao.vehnt_staked.checked_sub(position_vehnt).unwrap();
  sub_dao.vehnt_fall_rate = sub_dao
    .vehnt_fall_rate
    .checked_sub(ctx.accounts.stake_position.fall_rate)
    .unwrap();
  ctx.accounts.sub_dao_epoch_info.total_vehnt = sub_dao.vehnt_staked;

  // delete the purge position thread
  let signer_seeds: &[&[&[u8]]] = &[&[
    "stake_position".as_bytes(),
    ctx.accounts.voter_authority.key.as_ref(),
    &[args.deposit_entry_idx],
    &[ctx.bumps["stake_position"]],
  ]];
  thread_delete(CpiContext::new_with_signer(
    ctx.accounts.clockwork.to_account_info(),
    clockwork_sdk::thread_program::cpi::accounts::ThreadDelete {
      authority: ctx.accounts.stake_position.to_account_info(),
      close_to: ctx.accounts.voter_authority.to_account_info(),
      thread: ctx.accounts.thread.to_account_info(),
    },
    signer_seeds,
  ))?;
  Ok(())
}
