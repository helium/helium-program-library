use crate::{current_epoch, state::*, utils::*};
use anchor_lang::prelude::*;
use voter_stake_registry::state::{Registrar, Voter};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct StakeArgsV0 {
  pub vehnt_amount: u64,
  pub deposit_entry_idx: u8,
}

#[derive(Accounts)]
#[instruction(args: StakeArgsV0)]
pub struct StakeV0<'info> {
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
    init_if_needed,
    space = 60 + 8 + std::mem::size_of::<Staker>(),
    payer = voter_authority
  )]
  pub staker: Box<Account<'info, Staker>>,
  #[account(
    init,
    space = 60 + 8 + std::mem::size_of::<StakePosition>(),
    payer = voter_authority,
    seeds = ["stake_position".as_bytes(), voter_authority.key().as_ref(), &[args.deposit_entry_idx]],
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

pub fn handler(ctx: Context<StakeV0>, args: StakeArgsV0) -> Result<()> {
  // load the vehnt information
  let voter = ctx.accounts.vsr_voter.load()?;
  let registrar = &ctx.accounts.registrar.load()?;
  let d_entry = voter.deposits[args.deposit_entry_idx as usize];
  let voting_mint_config = &registrar.voting_mints[d_entry.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  let available_vehnt = d_entry.voting_power(voting_mint_config, curr_ts)?;
  let future_vehnt = d_entry.voting_power(voting_mint_config, curr_ts + 1)?;

  assert!(available_vehnt >= args.vehnt_amount);

  let curr_epoch = current_epoch(ctx.accounts.clock.unix_timestamp);

  if ctx.accounts.stake_position.hnt_amount > 0 {
    // this is updating an existing StakePosition

    // assert that all available rewards have been claimed
    assert!(ctx.accounts.stake_position.last_claimed_epoch == curr_epoch - 1);
    // TODO allow updates
  } else {
    // new StakePosition
    // vehnt_staked += vehnt_amount
    // vehnt_staked -= vehnt_fall_rate * (curr_ts - vehnt_last_calculated_ts)
    // vehnt_fall_rate = vehnt_fall_rate + (vehnt_amount * vehnt_fall_per_second) = vehnt_fall_rate + (vehnt_amount * (current_vehnt - future_vehnt))

    let sub_dao = &mut ctx.accounts.sub_dao;

    update_subdao_vehnt(sub_dao, curr_ts);
    sub_dao.vehnt_staked = sub_dao.vehnt_staked.checked_add(args.vehnt_amount).unwrap();
    sub_dao.vehnt_fall_rate = sub_dao
      .vehnt_fall_rate
      .checked_add(
        args
          .vehnt_amount
          .checked_mul(available_vehnt.checked_sub(future_vehnt).unwrap())
          .unwrap(),
      )
      .unwrap();

    ctx.accounts.sub_dao_epoch_info.total_vehnt = sub_dao.vehnt_staked;

    let ratio = args.vehnt_amount.checked_div(available_vehnt).unwrap();
    let underlying_hnt = ratio.checked_mul(d_entry.amount_deposited_native).unwrap();
    ctx.accounts.stake_position.set_inner(StakePosition {
      hnt_amount: underlying_hnt,
      deposit_entry_idx: args.deposit_entry_idx,
      sub_dao: ctx.accounts.sub_dao.key(),
      last_claimed_epoch: curr_epoch,
    });
    // TODO add stakeposition to staker
  }
  Ok(())
}
