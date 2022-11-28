use crate::{current_epoch, get_percent, state::*, update_subdao_vehnt};
use anchor_lang::prelude::*;
use clockwork_sdk::thread_program::{self, accounts::Thread, cpi::thread_delete, ThreadProgram};
use voter_stake_registry::state::{Registrar, Voter};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CloseStakeArgsV0 {
  pub deposit_entry_idx: u8,
}

#[derive(Accounts)]
#[instruction(args: CloseStakeArgsV0)]
pub struct CloseStakeV0<'info> {
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

  ///CHECK: constraints
  #[account(address = voter_stake_registry::ID)]
  pub vsr_program: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,

  #[account(mut, address = Thread::pubkey(stake_position.key(), format!("purge-{:?}", args.deposit_entry_idx)))]
  pub thread: SystemAccount<'info>,
  #[account(address = thread_program::ID)]
  pub clockwork: Program<'info, ThreadProgram>,
}

pub fn handler(ctx: Context<CloseStakeV0>, args: CloseStakeArgsV0) -> Result<()> {
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

  // position_vehnt = available_vehnt * hnt_amount / amount_deposited_native
  let position_vehnt = available_vehnt
    .checked_mul(ctx.accounts.stake_position.hnt_amount)
    .unwrap()
    .checked_div(d_entry.amount_deposited_native)
    .unwrap();

  let sub_daos = &mut ctx.remaining_accounts.to_vec();
  let stake_position = &mut ctx.accounts.stake_position;

  // remove any remaining stakes
  for i in 0..stake_position.allocations.len() {
    if (stake_position.allocations[i].percent == 0) || sub_daos[i].key() == Pubkey::default() {
      continue;
    }
    assert!(stake_position.allocations[i].sub_dao == sub_daos[i].key());
    assert!(sub_daos[i].is_writable);

    let mut sub_dao_data: &[u8] = &sub_daos[i].try_borrow_data()?;
    let sub_dao = &mut SubDaoV0::try_deserialize(&mut sub_dao_data)?;

    update_subdao_vehnt(sub_dao, curr_ts);

    let sd_stake = get_percent(position_vehnt, stake_position.allocations[i].percent).unwrap();
    let sd_fall_rate = get_percent(
      stake_position.fall_rate,
      stake_position.allocations[i].percent,
    )
    .unwrap();
    // remove this stake information from the subdao
    sub_dao.vehnt_staked = sub_dao.vehnt_staked.checked_sub(sd_stake).unwrap();
    sub_dao.vehnt_fall_rate = sub_dao.vehnt_fall_rate.checked_sub(sd_fall_rate).unwrap();
  }

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
      authority: stake_position.to_account_info(),
      close_to: ctx.accounts.voter_authority.to_account_info(),
      thread: ctx.accounts.thread.to_account_info(),
    },
    signer_seeds,
  ))?;
  Ok(())
}
