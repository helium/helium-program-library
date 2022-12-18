use crate::{ThreadProgram, current_epoch, state::*, utils::*};
use anchor_lang::{prelude::*, solana_program::instruction::Instruction};
use clockwork_sdk::{
  state::{Thread, Trigger},
  cpi::thread_create,
};
use shared_utils::PreciseNumber;
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
  #[account(
    seeds = [registrar.load()?.realm.as_ref(), b"registrar".as_ref(), dao.hnt_mint.as_ref()],
    seeds::program = vsr_program.key(),
    bump,
  )]
  pub registrar: AccountLoader<'info, Registrar>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,

  #[account(
    init_if_needed,
    space = 60 + 8 + std::mem::size_of::<StakePositionV0>(),
    payer = voter_authority,
    seeds = ["stake_position".as_bytes(), voter_authority.key().as_ref(), &[args.deposit_entry_idx]],
    bump,
  )]
  pub stake_position: Box<Account<'info, StakePositionV0>>,

  ///CHECK: constraints
  #[account(address = voter_stake_registry::ID)]
  pub vsr_program: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,

  /// CHECK: handled by thread_create
  #[account(mut, address = Thread::pubkey(stake_position.key(), format!("purge-{:?}", args.deposit_entry_idx)))]
  pub thread: AccountInfo<'info>,
  pub clockwork: Program<'info, ThreadProgram>,
}

pub fn handler(ctx: Context<StakeV0>, args: StakeArgsV0) -> Result<()> {
  // load the vehnt information
  let voter = ctx.accounts.vsr_voter.load()?;
  let registrar = &ctx.accounts.registrar.load()?;
  let d_entry = voter.deposits[args.deposit_entry_idx as usize];
  let voting_mint_config = &registrar.voting_mints[d_entry.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  let available_vehnt = d_entry.voting_power(voting_mint_config, curr_ts)?;

  let seconds_left = d_entry
    .lockup
    .seconds_left(curr_ts)
    .checked_sub(10)
    .unwrap();
  let future_ts = curr_ts
    .checked_add(seconds_left.try_into().unwrap())
    .unwrap();
  let future_vehnt = d_entry.voting_power(voting_mint_config, future_ts)?;

  let fall_rate = calculate_fall_rate(available_vehnt, future_vehnt, seconds_left).unwrap();

  let to_stake_vehnt_amount = std::cmp::min(args.vehnt_amount, available_vehnt);

  let curr_epoch = current_epoch(curr_ts);

  // underlying_hnt = amount_deposited_native * vehnt_amount / available_vehnt
  // position_fall_rate = fall_rate * vehnt_amount / available_vehnt
  let underlying_hnt = PreciseNumber::new(d_entry.amount_deposited_native.into())
    .unwrap()
    .checked_mul(&PreciseNumber::new(to_stake_vehnt_amount.into()).unwrap())
    .unwrap()
    .checked_div(&PreciseNumber::new(available_vehnt.into()).unwrap())
    .unwrap();
  let position_fall_rate: u64 = u128::from(fall_rate)
    .checked_mul(to_stake_vehnt_amount.into())
    .unwrap()
    .checked_div(available_vehnt.into())
    .unwrap()
    .try_into()
    .ok()
    .unwrap();

  let sub_dao = &mut ctx.accounts.sub_dao;
  let stake_position = &mut ctx.accounts.stake_position;

  let mut old_position_vehnt = 0;

  if stake_position.last_claimed_epoch > 0 {
    // updating pos, assert that all available rewards have been claimed
    assert!(stake_position.last_claimed_epoch >= curr_epoch - 1);

    old_position_vehnt = calculate_voting_power(
      d_entry,
      voting_mint_config,
      stake_position.hnt_amount,
      stake_position.hnt_amount,
      curr_ts,
    )?;
  }

  // update the stake
  update_subdao_vehnt(sub_dao, curr_ts);
  sub_dao.vehnt_staked = sub_dao
    .vehnt_staked
    .checked_sub(old_position_vehnt)
    .unwrap()
    .checked_add(to_stake_vehnt_amount)
    .unwrap();
  sub_dao.vehnt_fall_rate = sub_dao
    .vehnt_fall_rate
    .checked_sub(stake_position.fall_rate)
    .unwrap()
    .checked_add(position_fall_rate)
    .unwrap();

  if stake_position.last_claimed_epoch == 0 {
    // init stake position
    stake_position.deposit_entry_idx = args.deposit_entry_idx;
    stake_position.purged = false;
    stake_position.expiry_ts = curr_ts
      .checked_add(d_entry.lockup.seconds_left(curr_ts).try_into().unwrap())
      .unwrap();

    // init the clockwork thread to purge the position when it expires
    let signer_seeds: &[&[&[u8]]] = &[&[
      "stake_position".as_bytes(),
      ctx.accounts.voter_authority.key.as_ref(),
      &[args.deposit_entry_idx],
      &[ctx.bumps["stake_position"]],
    ]];

    let seconds_until_expiry = d_entry.lockup.seconds_left(curr_ts);
    let expiry_ts = curr_ts
      .checked_add(seconds_until_expiry.try_into().unwrap())
      .unwrap();
    let cron = create_cron(expiry_ts, (60 * 60 * 2).try_into().unwrap());

    // build clockwork kickoff ix
    let accounts = vec![
      AccountMeta::new_readonly(ctx.accounts.vsr_voter.key(), false),
      AccountMeta::new(ctx.accounts.voter_authority.key(), true),
      AccountMeta::new_readonly(ctx.accounts.registrar.key(), false),
      AccountMeta::new_readonly(ctx.accounts.dao.key(), false),
      AccountMeta::new(ctx.accounts.sub_dao.key(), false),
      AccountMeta::new(stake_position.key(), false),
      AccountMeta::new_readonly(ctx.accounts.vsr_program.key(), false),
      AccountMeta::new_readonly(ctx.accounts.clock.key(), false),
      AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
      AccountMeta::new(ctx.accounts.thread.key(), false),
      AccountMeta::new_readonly(ctx.accounts.clockwork.key(), false),
    ];
    let purge_ix = Instruction {
      program_id: crate::ID,
      accounts,
      data: clockwork_sdk::utils::anchor_sighash("purge_position_v0").to_vec(),
    };

    // initialize thread
    thread_create(
      CpiContext::new_with_signer(
        ctx.accounts.clockwork.to_account_info(),
        clockwork_sdk::cpi::ThreadCreate {
          authority: stake_position.to_account_info(),
          payer: ctx.accounts.voter_authority.to_account_info(),
          thread: ctx.accounts.thread.to_account_info(),
          system_program: ctx.accounts.system_program.to_account_info(),
        },
        signer_seeds,
      ),
      format!("purge-{:?}", args.deposit_entry_idx),
      purge_ix.into(),
      Trigger::Cron {
        schedule: cron,
        skippable: false,
      },
    )?;
  }
  stake_position.hnt_amount = underlying_hnt.to_imprecise().unwrap().try_into().unwrap();
  stake_position.last_claimed_epoch = curr_epoch;
  stake_position.fall_rate = position_fall_rate;

  Ok(())
}
