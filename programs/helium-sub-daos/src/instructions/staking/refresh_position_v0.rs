use crate::{error::ErrorCode, state::*, utils::*};
use anchor_lang::prelude::*;
use voter_stake_registry::state::{Registrar, Voter};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct RefreshPositionArgsV0 {
  pub deposit_entry_idx: u8,
}

#[derive(Accounts)]
#[instruction(args: RefreshPositionArgsV0)]
pub struct RefreshPositionV0<'info> {
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
    seeds = ["stake_position".as_bytes(), voter_authority.key().as_ref(), &[args.deposit_entry_idx]],
    bump,
  )]
  pub stake_position: Account<'info, StakePositionV0>,

  ///CHECK: constraints
  #[account(address = voter_stake_registry::ID)]
  pub vsr_program: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<RefreshPositionV0>, args: RefreshPositionArgsV0) -> Result<()> {
  // load the vehnt information
  let voter = ctx.accounts.vsr_voter.load()?;
  let registrar = &ctx.accounts.registrar.load()?;
  let d_entry = voter.deposits[args.deposit_entry_idx as usize];
  let voting_mint_config = &registrar.voting_mints[d_entry.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  let available_vehnt = d_entry.voting_power(voting_mint_config, curr_ts)?;
  let future_vehnt = d_entry.voting_power(voting_mint_config, curr_ts + 1)?;
  let fall_rate = available_vehnt.checked_sub(future_vehnt).unwrap();

  if ctx.accounts.stake_position.hnt_amount <= d_entry.amount_deposited_native {
    // this position doesn't need to be refreshed
    return Err(error!(ErrorCode::RefreshNotNeeded));
  }
  // this position needs to be reduced

  let sub_daos = &mut ctx.remaining_accounts.to_vec();
  let stake_position = &mut ctx.accounts.stake_position;
  assert!(sub_daos.len() == stake_position.allocations.len());

  let old_position_vehnt = calculate_voting_power(
    d_entry,
    voting_mint_config,
    stake_position.hnt_amount,
    stake_position.hnt_amount,
    curr_ts,
  )?;

  assert!(old_position_vehnt > available_vehnt);
  assert!(stake_position.fall_rate >= fall_rate);

  for (i, sd_acc_info) in sub_daos
    .iter()
    .enumerate()
    .take(stake_position.allocations.len())
  {
    if (stake_position.allocations[i].percent == 0) || sd_acc_info.key() == Pubkey::default() {
      continue;
    }
    assert!(stake_position.allocations[i].sub_dao == sd_acc_info.key());
    assert!(sd_acc_info.is_writable);
    let perc = stake_position.allocations[i].percent;

    let mut sub_dao_data = sd_acc_info.try_borrow_mut_data()?;
    let mut sub_dao_data_slice: &[u8] = &sub_dao_data;
    let sub_dao = &mut SubDaoV0::try_deserialize(&mut sub_dao_data_slice)?;

    let vehnt_diff = old_position_vehnt
      .checked_sub(available_vehnt)
      .unwrap()
      .get_percent(perc)
      .unwrap();
    let fall_rate_diff = stake_position
      .fall_rate
      .checked_sub(fall_rate)
      .unwrap()
      .get_percent(perc)
      .unwrap();
    // update subdao calculations
    update_subdao_vehnt(sub_dao, curr_ts);

    sub_dao.vehnt_staked = sub_dao.vehnt_staked.checked_sub(vehnt_diff).unwrap();
    sub_dao.vehnt_fall_rate = sub_dao.vehnt_fall_rate.checked_sub(fall_rate_diff).unwrap();

    sub_dao.try_serialize(&mut *sub_dao_data)?;
  }

  // update the stake position
  stake_position.fall_rate = fall_rate;
  stake_position.hnt_amount = d_entry.amount_deposited_native;
  stake_position.last_claimed_epoch = current_epoch(curr_ts);

  Ok(())
}
