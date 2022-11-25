use crate::{current_epoch, state::*, utils::*};
use anchor_lang::prelude::*;
use voter_stake_registry::{
  self,
  state::{Registrar, Voter},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct StakeArgsV0 {
  pub vehnt_amount: u64,
  pub deposit_entry_idx: u8,
}

#[derive(Accounts)]
#[instruction(args: StakeArgsV0)]
pub struct StakeV0<'info> {
  #[account(
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
    init,
    space = 60 + 8 + std::mem::size_of::<StakePositionV0>(),
    payer = voter_authority,
    seeds = ["stake_position".as_bytes(), voter_authority.key().as_ref(), &[args.deposit_entry_idx]],
    bump,
  )]
  pub stake_position: Box<Account<'info, StakePositionV0>>,
  #[account(mut)]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
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

pub fn handler(ctx: Context<StakeV0>, args: StakeArgsV0) -> Result<()> {
  // load the vehnt information
  let voter = ctx.accounts.vsr_voter.load()?;
  let registrar = &ctx.accounts.registrar.load()?;
  let d_entry = voter.deposits[args.deposit_entry_idx as usize];
  let voting_mint_config = &registrar.voting_mints[d_entry.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  let available_vehnt = d_entry.voting_power(voting_mint_config, curr_ts)?;
  let future_vehnt = d_entry.voting_power(voting_mint_config, curr_ts + 1)?;
  let fall_rate = available_vehnt.checked_sub(future_vehnt).unwrap();

  let to_stake_vehnt_amount = if args.vehnt_amount > available_vehnt {
    available_vehnt
  } else {
    args.vehnt_amount
  };

  let curr_epoch = current_epoch(ctx.accounts.clock.unix_timestamp);

  if ctx.accounts.stake_position.hnt_amount > 0 {
    // this is updating an existing StakePositionV0

    // assert that all available rewards have been claimed
    assert!(ctx.accounts.stake_position.last_claimed_epoch == curr_epoch - 1);
    // TODO allow updates
  } else {
    // new StakePositionV0
    // vehnt_staked += vehnt_amount
    // vehnt_staked -= vehnt_fall_rate * (curr_ts - vehnt_last_calculated_ts)
    // vehnt_fall_rate = vehnt_fall_rate + (current_vehnt - future_vehnt)

    let sub_dao = &mut ctx.accounts.sub_dao;

    update_subdao_vehnt(sub_dao, curr_ts);
    sub_dao.vehnt_staked = sub_dao
      .vehnt_staked
      .checked_add(to_stake_vehnt_amount)
      .unwrap();
    sub_dao.vehnt_fall_rate = sub_dao.vehnt_fall_rate.checked_add(fall_rate).unwrap();

    ctx.accounts.sub_dao_epoch_info.total_vehnt = sub_dao.vehnt_staked;

    // underlying_hnt = amount_deposited_native * vehnt_amount / available_vehnt
    // position_fall_rate = fall_rate * vehnt_amount / available_vehnt
    let underlying_hnt = d_entry
      .amount_deposited_native
      .checked_mul(to_stake_vehnt_amount)
      .unwrap()
      .checked_div(available_vehnt)
      .unwrap();
    let position_fall_rate = fall_rate
      .checked_mul(to_stake_vehnt_amount)
      .unwrap()
      .checked_div(available_vehnt)
      .unwrap();

    ctx.accounts.stake_position.set_inner(StakePositionV0 {
      hnt_amount: underlying_hnt,
      deposit_entry_idx: args.deposit_entry_idx,
      sub_dao: ctx.accounts.sub_dao.key(),
      last_claimed_epoch: curr_epoch,
      fall_rate: position_fall_rate,
      purged: false,
    });
  }
  Ok(())
}
