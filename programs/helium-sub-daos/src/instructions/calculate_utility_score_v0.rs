use crate::{current_epoch, error::ErrorCode, state::*, update_subdao_vehnt, OrArithError};
use anchor_lang::{prelude::*, solana_program::instruction::Instruction, InstructionData};
use anchor_spl::token::{Mint, Token};
use circuit_breaker::CircuitBreaker;
use clockwork_sdk::{self, state::ThreadResponse};
use shared_utils::precise_number::{PreciseNumber, FOUR_PREC, TWO_PREC};
use switchboard_v2::{AggregatorAccountData, AggregatorHistoryBuffer};
use voter_stake_registry::state::Registrar;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CalculateUtilityScoreArgsV0 {
  pub epoch: u64,
}

pub const TESTING: bool = std::option_env!("TESTING").is_some();

#[derive(Accounts)]
#[instruction(args: CalculateUtilityScoreArgsV0)]
pub struct CalculateUtilityScoreV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    has_one = registrar,
    has_one = hnt_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    has_one = dao,
    has_one = active_device_aggregator
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    has_one = history_buffer
  )]
  pub active_device_aggregator: AccountLoader<'info, AggregatorAccountData>,
  /// CHECK: Checked by has_one with active device aggregator
  pub history_buffer: AccountInfo<'info>,
  #[account(
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &(args.epoch - 1).to_le_bytes()],
    bump,
  )]
  /// CHECK: May not have ever been initialized
  pub prev_dao_epoch_info: UncheckedAccount<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<DaoEpochInfoV0>(),
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump,
  )]
  pub dao_epoch_info: Box<Account<'info, DaoEpochInfoV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<SubDaoEpochInfoV0>(),
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

fn construct_next_ix(ctx: &Context<CalculateUtilityScoreV0>, epoch: u64) -> Instruction {
  let hnt_circuit_breaker = Pubkey::find_program_address(
    &[
      "mint_windowed_breaker".as_bytes(),
      ctx.accounts.dao.hnt_mint.as_ref(),
    ],
    &ctx.accounts.circuit_breaker_program.key(),
  )
  .0;
  let dnt_circuit_breaker = Pubkey::find_program_address(
    &[
      "mint_windowed_breaker".as_bytes(),
      ctx.accounts.sub_dao.dnt_mint.as_ref(),
    ],
    &ctx.accounts.circuit_breaker_program.key(),
  )
  .0;
  // issue rewards ix
  let accounts = vec![
    AccountMeta::new_readonly(ctx.accounts.dao.key(), false),
    AccountMeta::new_readonly(ctx.accounts.sub_dao.key(), false),
    AccountMeta::new(ctx.accounts.dao_epoch_info.key(), false), // use the current epoch infos
    AccountMeta::new(ctx.accounts.sub_dao_epoch_info.key(), false),
    AccountMeta::new(hnt_circuit_breaker, false),
    AccountMeta::new(dnt_circuit_breaker, false),
    AccountMeta::new(ctx.accounts.dao.hnt_mint, false),
    AccountMeta::new(ctx.accounts.sub_dao.dnt_mint, false),
    AccountMeta::new(ctx.accounts.sub_dao.treasury, false),
    AccountMeta::new(ctx.accounts.sub_dao.rewards_escrow, false),
    AccountMeta::new(ctx.accounts.sub_dao.delegator_pool, false),
    AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
    AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
    AccountMeta::new_readonly(ctx.accounts.circuit_breaker_program.key(), false),
  ];
  Instruction {
    program_id: crate::ID,
    accounts,
    data: crate::instruction::IssueRewardsV0 {
      args: crate::IssueRewardsArgsV0 { epoch },
    }
    .data(),
  }
}

pub fn handler(
  ctx: Context<CalculateUtilityScoreV0>,
  args: CalculateUtilityScoreArgsV0,
) -> Result<ThreadResponse> {
  let curr_ts = ctx.accounts.registrar.clock_unix_timestamp();
  let epoch = current_epoch(curr_ts);

  // Set total rewards, accounting for net emmissions by counting
  // burned hnt since last supply setting.
  let curr_supply = ctx.accounts.hnt_mint.supply;
  let mut prev_supply = curr_supply;
  if ctx.accounts.prev_dao_epoch_info.lamports() > 0 {
    let info: Account<DaoEpochInfoV0> = Account::try_from(&ctx.accounts.prev_dao_epoch_info)?;
    prev_supply = info.current_hnt_supply;
  }

  ctx.accounts.dao_epoch_info.total_rewards = ctx
    .accounts
    .dao
    .emission_schedule
    .get_emissions_at(Clock::get()?.unix_timestamp)
    .unwrap()
    .checked_add(std::cmp::min(
      prev_supply.checked_sub(curr_supply).unwrap(),
      ctx.accounts.dao.net_emissions_cap,
    ))
    .unwrap();
  ctx.accounts.dao_epoch_info.epoch = args.epoch;

  ctx.accounts.dao_epoch_info.current_hnt_supply = curr_supply
    .checked_add(ctx.accounts.dao_epoch_info.total_rewards)
    .unwrap();

  if !TESTING && args.epoch >= epoch {
    return Err(error!(ErrorCode::EpochNotOver));
  }

  let next_ix = construct_next_ix(&ctx, args.epoch);
  if !TESTING && ctx.accounts.sub_dao_epoch_info.utility_score.is_some() {
    msg!("Utility score has already been calculated, exiting");
    return Ok(ThreadResponse {
      kickoff_instruction: None,
      next_instruction: Some(next_ix.into()),
    });
  }

  if curr_ts < ctx.accounts.dao.emission_schedule[0].start_unix_time {
    return Err(error!(ErrorCode::EpochToEarly));
  }

  ctx.accounts.sub_dao_epoch_info.epoch = args.epoch;
  let epoch_end_ts = ctx.accounts.sub_dao_epoch_info.end_ts();
  update_subdao_vehnt(
    &mut ctx.accounts.sub_dao,
    &mut ctx.accounts.sub_dao_epoch_info,
    epoch_end_ts,
  )?;

  ctx.accounts.dao_epoch_info.dao = ctx.accounts.dao.key();
  ctx.accounts.sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
  ctx.accounts.sub_dao_epoch_info.bump_seed = *ctx.bumps.get("sub_dao_epoch_info").unwrap();
  ctx.accounts.sub_dao_epoch_info.initialized = true;
  ctx.accounts.dao_epoch_info.bump_seed = *ctx.bumps.get("dao_epoch_info").unwrap();

  // Calculate utility score
  // utility score = V * D * A
  // V = max(1, veHNT_dnp).
  // D = max(1, sqrt(DCs burned in USD)). 1 DC = $0.00001.
  // A = max(1, fourth_root(Total active device count * device activation fee)).
  let epoch_info = &mut ctx.accounts.sub_dao_epoch_info;

  let dc_burned = PreciseNumber::new(epoch_info.dc_burned.into())
    .or_arith_error()?
    .checked_div(&PreciseNumber::new(100000_u128).or_arith_error()?) // DC has 0 decimals, plus 10^5 to get to dollars.
    .or_arith_error()?;

  let history_buffer = AggregatorHistoryBuffer::new(&ctx.accounts.history_buffer)?;
  let total_devices_u64 = u64::try_from(
    history_buffer
      .lower_bound(epoch_end_ts)
      .unwrap()
      .value
      .mantissa,
  )
  .unwrap();

  msg!(
    "Total devices: {}. Dc burned: {}.",
    total_devices_u64,
    epoch_info.dc_burned
  );

  let total_devices = PreciseNumber::new(total_devices_u64.into()).or_arith_error()?;
  let devices_with_fee = total_devices
    .checked_mul(
      &PreciseNumber::new(u128::from(ctx.accounts.sub_dao.onboarding_dc_fee)).or_arith_error()?,
    )
    .or_arith_error()?
    .checked_div(&PreciseNumber::new(100000_u128).or_arith_error()?) // Need onboarding fee in dollars
    .or_arith_error()?;

  // sqrt(x) = e^(ln(x)/2)
  // x^1/4 = e^(ln(x)/4))
  let one = PreciseNumber::one();
  let d = if epoch_info.dc_burned > 0 {
    std::cmp::max(
      one.clone(),
      dc_burned
        .log()
        .or_arith_error()?
        .checked_div(&FOUR_PREC.clone().signed())
        .or_arith_error()?
        .exp()
        .or_arith_error()?,
    )
  } else {
    one.clone()
  };

  let vehnt_staked = PreciseNumber::new(epoch_info.vehnt_at_epoch_start.into())
    .or_arith_error()?
    .checked_div(&PreciseNumber::new(100000000_u128).or_arith_error()?) // vehnt has 8 decimals
    .or_arith_error()?;

  let v = std::cmp::max(one.clone(), vehnt_staked);

  let a = if total_devices_u64 > 0 {
    std::cmp::max(
      one,
      devices_with_fee
        .log()
        .or_arith_error()?
        .checked_div(&TWO_PREC.clone().signed())
        .or_arith_error()?
        .exp()
        .or_arith_error()?,
    )
  } else {
    one
  };

  let utility_score_prec = d
    .checked_mul(&a)
    .or_arith_error()?
    .checked_mul(&v)
    .or_arith_error()?;
  // Convert to u128 with 12 decimals of precision
  let utility_score = utility_score_prec
    .checked_mul(
      &PreciseNumber::new(1000000000000_u128).or_arith_error()?, // u128 with 12 decimal places
    )
    .or_arith_error()?
    .to_imprecise()
    .unwrap();

  // Store utility scores
  epoch_info.utility_score = Some(utility_score);

  // Only increment utility scores when either (a) in prod or (b) testing and we haven't already over-calculated utility scores.
  // TODO: We can remove this after breakpoint demo
  if !(TESTING
    && ctx.accounts.dao_epoch_info.num_utility_scores_calculated > ctx.accounts.dao.num_sub_daos)
  {
    ctx.accounts.dao_epoch_info.num_utility_scores_calculated += 1;
    ctx.accounts.dao_epoch_info.total_utility_score = ctx
      .accounts
      .dao_epoch_info
      .total_utility_score
      .checked_add(utility_score)
      .unwrap();
  }

  Ok(ThreadResponse {
    kickoff_instruction: None,
    next_instruction: Some(next_ix.into()),
  })
}
