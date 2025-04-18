use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{set_authority, spl_token::instruction::AuthorityType, Mint, SetAuthority, Token},
};
use circuit_breaker::{CircuitBreaker, ThresholdType, WindowedCircuitBreakerConfigV0};
use shared_utils::resize_to_fit;
use time::OffsetDateTime;
use treasury_management::{
  cpi::{accounts::InitializeTreasuryManagementV0, initialize_treasury_management_v0},
  Curve as TreasuryCurve, InitializeTreasuryManagementArgsV0, TreasuryManagement,
};

use crate::{next_epoch_ts, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum Curve {
  // c^k
  ExponentialCurveV0 { k: u128 },
}

impl Default for Curve {
  fn default() -> Self {
    Curve::ExponentialCurveV0 { k: 1 }
  }
}

impl From<Curve> for TreasuryCurve {
  fn from(curve: Curve) -> Self {
    match curve {
      Curve::ExponentialCurveV0 { k } => TreasuryCurve::ExponentialCurveV0 { k },
    }
  }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeSubDaoArgsV0 {
  pub authority: Pubkey,
  pub emission_schedule: Vec<EmissionScheduleItem>,
  pub treasury_curve: Curve,
  pub onboarding_dc_fee: u64,
  /// Authority to burn delegated data credits
  pub dc_burn_authority: Pubkey,
  pub registrar: Pubkey,
  pub onboarding_data_only_dc_fee: u64,
  pub active_device_authority: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitializeSubDaoArgsV0)]
pub struct InitializeSubDaoV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    mut,
    has_one = authority,
    has_one = hnt_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  pub authority: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<SubDaoV0>() + (std::mem::size_of::<EmissionScheduleItem>() * args.emission_schedule.len()),
    seeds = ["sub_dao".as_bytes(), dnt_mint.key().as_ref()],
    bump,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub dnt_mint: Box<Account<'info, Mint>>,
  pub dnt_mint_authority: Signer<'info>,
  pub sub_dao_freeze_authority: Signer<'info>,
  /// CHECK: Checked via CPI
  #[account(mut)]
  pub treasury: AccountInfo<'info>,
  /// CHECK: Checked via CPI
  #[account(
    mut,
    seeds = ["account_windowed_breaker".as_bytes(), treasury.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump,
  )]
  pub treasury_circuit_breaker: AccountInfo<'info>,
  /// CHECK: Checked via cpi
  #[account(
    mut,
    seeds = ["treasury_management".as_bytes(), dnt_mint.key().as_ref()],
    seeds::program = treasury_management_program.key(),
    bump,
  )]
  pub treasury_management: AccountInfo<'info>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub treasury_management_program: Program<'info, TreasuryManagement>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

// returns a cron that starts at <offset> past the end of the current epoch and triggers at the same time daily.
pub fn create_end_epoch_cron(curr_ts: i64, offset: u64) -> String {
  let next_epoch = next_epoch_ts(curr_ts) + offset;
  let dt = OffsetDateTime::from_unix_timestamp(next_epoch.try_into().unwrap())
    .ok()
    .unwrap();
  format!("0 {:?} {:?} * * * *", dt.minute(), dt.hour())
}

pub fn handler(ctx: Context<InitializeSubDaoV0>, args: InitializeSubDaoArgsV0) -> Result<()> {
  initialize_treasury_management_v0(
    CpiContext::new(
      ctx.accounts.treasury_management_program.to_account_info(),
      InitializeTreasuryManagementV0 {
        payer: ctx.accounts.payer.to_account_info(),
        treasury_management: ctx.accounts.treasury_management.to_account_info(),
        treasury_mint: ctx.accounts.hnt_mint.to_account_info(),
        mint_authority: ctx.accounts.dnt_mint_authority.to_account_info(),
        supply_mint: ctx.accounts.dnt_mint.to_account_info(),
        circuit_breaker: ctx.accounts.treasury_circuit_breaker.to_account_info(),
        treasury: ctx.accounts.treasury.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        circuit_breaker_program: ctx.accounts.circuit_breaker_program.to_account_info(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
      },
    ),
    InitializeTreasuryManagementArgsV0 {
      authority: ctx.accounts.sub_dao.key(),
      curve: args.treasury_curve.into(),
      freeze_unix_time: i64::MAX,
      window_config: WindowedCircuitBreakerConfigV0 {
        window_size_seconds: u64::try_from(24 * 60 * 60).unwrap(),
        threshold_type: ThresholdType::Percent,
        threshold: u64::MAX.checked_div(5_u64).unwrap(), // 20%
      },
    },
  )?;

  set_authority(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      SetAuthority {
        account_or_mint: ctx.accounts.dnt_mint.to_account_info(),
        current_authority: ctx.accounts.sub_dao_freeze_authority.to_account_info(),
      },
    ),
    AuthorityType::FreezeAccount,
    Some(ctx.accounts.sub_dao.key()),
  )?;

  ctx.accounts.dao.num_sub_daos += 1;
  ctx.accounts.sub_dao.set_inner(SubDaoV0 {
    _deprecated_active_device_aggregator: Pubkey::default(),
    dao: ctx.accounts.dao.key(),
    dnt_mint: ctx.accounts.dnt_mint.key(),
    dc_burn_authority: args.dc_burn_authority,
    treasury: ctx.accounts.treasury.key(),
    onboarding_dc_fee: args.onboarding_dc_fee,
    rewards_escrow: Pubkey::default(),
    authority: args.authority,
    emission_schedule: args.emission_schedule,
    registrar: args.registrar,
    bump_seed: ctx.bumps.sub_dao,
    vehnt_delegated: 0,
    vehnt_last_calculated_ts: Clock::get()?.unix_timestamp,
    vehnt_fall_rate: 0,
    delegator_pool: Pubkey::default(),
    _deprecated_delegator_rewards_percent: 0,
    onboarding_data_only_dc_fee: args.onboarding_data_only_dc_fee,
    active_device_authority: args.active_device_authority,
    dc_onboarding_fees_paid: 0,
  });

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.sub_dao,
  )?;

  Ok(())
}
