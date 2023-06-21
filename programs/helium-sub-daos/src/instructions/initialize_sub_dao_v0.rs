use crate::next_epoch_ts;
use crate::{state::*, EPOCH_LENGTH};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{set_authority, Mint, SetAuthority, Token, TokenAccount};
use circuit_breaker::{
  cpi::{
    accounts::InitializeAccountWindowedBreakerV0, accounts::InitializeMintWindowedBreakerV0,
    initialize_account_windowed_breaker_v0, initialize_mint_windowed_breaker_v0,
  },
  CircuitBreaker, InitializeAccountWindowedBreakerArgsV0, InitializeMintWindowedBreakerArgsV0,
};
use circuit_breaker::{
  ThresholdType as CBThresholdType,
  WindowedCircuitBreakerConfigV0 as CBWindowedCircuitBreakerConfigV0,
};
use shared_utils::resize_to_fit;
use switchboard_v2::AggregatorAccountData;
use time::OffsetDateTime;
use treasury_management::{
  circuit_breaker::{
    ThresholdType as TMThresholdType,
    WindowedCircuitBreakerConfigV0 as TMWindowedCircuitBreakerConfigV0,
  },
  cpi::{accounts::InitializeTreasuryManagementV0, initialize_treasury_management_v0},
  Curve as TreasuryCurve, InitializeTreasuryManagementArgsV0, TreasuryManagement,
};

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
  pub delegator_rewards_percent: u64,
  pub onboarding_data_only_dc_fee: u64,
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
  /// CHECK: Initialized via cpi
  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), dnt_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump
  )]
  pub circuit_breaker: AccountInfo<'info>,
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
  #[account(
    constraint = rewards_escrow.mint == dnt_mint.key()
  )]
  pub rewards_escrow: Box<Account<'info, TokenAccount>>,

  /// CHECK: Initialized via cpi
  #[account(
    mut,
    seeds = ["account_windowed_breaker".as_bytes(), delegator_pool.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump
  )]
  pub delegator_pool_circuit_breaker: AccountInfo<'info>,
  #[account(
    init,
    payer = payer,
    seeds = ["delegator_pool".as_bytes(), dnt_mint.key().as_ref()],
    bump,
    token::mint = dnt_mint,
    token::authority = sub_dao,
  )]
  pub delegator_pool: Box<Account<'info, TokenAccount>>,

  pub active_device_aggregator: AccountLoader<'info, AggregatorAccountData>,
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

impl<'info> InitializeSubDaoV0<'info> {
  fn initialize_delegator_pool_breaker_ctx(
    &self,
  ) -> CpiContext<'_, '_, '_, 'info, InitializeAccountWindowedBreakerV0<'info>> {
    let cpi_accounts = InitializeAccountWindowedBreakerV0 {
      payer: self.payer.to_account_info(),
      circuit_breaker: self.delegator_pool_circuit_breaker.to_account_info(),
      token_account: self.delegator_pool.to_account_info(),
      owner: self.sub_dao.to_account_info(),
      token_program: self.token_program.to_account_info(),
      system_program: self.system_program.to_account_info(),
    };
    CpiContext::new(self.circuit_breaker_program.to_account_info(), cpi_accounts)
  }

  fn initialize_dnt_mint_breaker_ctx(
    &self,
  ) -> CpiContext<'_, '_, '_, 'info, InitializeMintWindowedBreakerV0<'info>> {
    let cpi_accounts = InitializeMintWindowedBreakerV0 {
      payer: self.payer.to_account_info(),
      circuit_breaker: self.circuit_breaker.to_account_info(),
      mint: self.dnt_mint.to_account_info(),
      mint_authority: self.dnt_mint_authority.to_account_info(),
      token_program: self.token_program.to_account_info(),
      system_program: self.system_program.to_account_info(),
    };
    CpiContext::new(self.circuit_breaker_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<InitializeSubDaoV0>, args: InitializeSubDaoArgsV0) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[&[
    "sub_dao".as_bytes(),
    ctx.accounts.dnt_mint.to_account_info().key.as_ref(),
    &[ctx.bumps["sub_dao"]],
  ]];
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
      window_config: TMWindowedCircuitBreakerConfigV0 {
        window_size_seconds: u64::try_from(24 * 60 * 60).unwrap(),
        threshold_type: TMThresholdType::Percent,
        threshold: u64::MAX.checked_div(5_u64).unwrap(), // 20%
      },
    },
  )?;

  initialize_mint_windowed_breaker_v0(
    ctx.accounts.initialize_dnt_mint_breaker_ctx(),
    InitializeMintWindowedBreakerArgsV0 {
      authority: args.authority,
      config: CBWindowedCircuitBreakerConfigV0 {
        // No more than 5 epochs worth can be distributed. We should be distributing once per epoch so this
        // should never get triggered.
        window_size_seconds: u64::try_from(EPOCH_LENGTH).unwrap(),
        threshold_type: CBThresholdType::Absolute,
        threshold: 5 * args.emission_schedule[0].emissions_per_epoch,
      },
      mint_authority: ctx.accounts.sub_dao.key(),
    },
  )?;

  initialize_account_windowed_breaker_v0(
    ctx
      .accounts
      .initialize_delegator_pool_breaker_ctx()
      .with_signer(signer_seeds),
    InitializeAccountWindowedBreakerArgsV0 {
      authority: args.authority,
      config: CBWindowedCircuitBreakerConfigV0 {
        window_size_seconds: u64::try_from(EPOCH_LENGTH).unwrap(),
        threshold_type: CBThresholdType::Absolute,
        threshold: 5 * args.emission_schedule[0].emissions_per_epoch,
      },
      owner: ctx.accounts.sub_dao.key(),
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

  require_gte!(
    100_u64.checked_mul(10_0000000).unwrap(),
    args.delegator_rewards_percent,
  );
  ctx.accounts.dao.num_sub_daos += 1;
  ctx.accounts.sub_dao.set_inner(SubDaoV0 {
    active_device_aggregator: ctx.accounts.active_device_aggregator.key(),
    dao: ctx.accounts.dao.key(),
    dnt_mint: ctx.accounts.dnt_mint.key(),
    dc_burn_authority: args.dc_burn_authority,
    treasury: ctx.accounts.treasury.key(),
    onboarding_dc_fee: args.onboarding_dc_fee,
    rewards_escrow: ctx.accounts.rewards_escrow.key(),
    authority: args.authority,
    emission_schedule: args.emission_schedule,
    registrar: args.registrar,
    bump_seed: ctx.bumps["sub_dao"],
    vehnt_delegated: 0,
    vehnt_last_calculated_ts: Clock::get()?.unix_timestamp,
    vehnt_fall_rate: 0,
    delegator_pool: ctx.accounts.delegator_pool.key(),
    delegator_rewards_percent: args.delegator_rewards_percent,
    onboarding_data_only_dc_fee: args.onboarding_data_only_dc_fee,
  });

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.sub_dao,
  )?;

  Ok(())
}
