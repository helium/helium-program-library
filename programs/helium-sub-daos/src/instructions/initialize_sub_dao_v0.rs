use crate::circuit_breaker::*;
use crate::{next_epoch_ts, state::*, EPOCH_LENGTH};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{set_authority, Mint, SetAuthority, Token, TokenAccount};
use circuit_breaker::{
  cpi::{accounts::InitializeMintWindowedBreakerV0, initialize_mint_windowed_breaker_v0},
  CircuitBreaker, InitializeMintWindowedBreakerArgsV0,
};
use circuit_breaker::{
  ThresholdType as CBThresholdType,
  WindowedCircuitBreakerConfigV0 as CBWindowedCircuitBreakerConfigV0,
};
use shared_utils::resize_to_fit;
use treasury_management::{
  cpi::{accounts::InitializeTreasuryManagementV0, initialize_treasury_management_v0},
  Curve as TreasuryCurve, InitializeTreasuryManagementArgsV0, TreasuryManagement,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum Curve {
  // c^k
  ExponentialCurveV0 { c: u128, k: u128 },
}

impl Default for Curve {
  fn default() -> Self {
    Curve::ExponentialCurveV0 { c: 1, k: 0 }
  }
}

impl From<Curve> for TreasuryCurve {
  fn from(curve: Curve) -> Self {
    match curve {
      Curve::ExponentialCurveV0 { c, k } => TreasuryCurve::ExponentialCurveV0 { c, k },
    }
  }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeSubDaoArgsV0 {
  pub authority: Pubkey,
  pub emission_schedule: Vec<EmissionScheduleItem>,
  pub treasury_curve: Curve,
  pub treasury_window_config: WindowedCircuitBreakerConfigV0,
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
  pub hotspot_collection: Box<Account<'info, Mint>>,
  /// CHECK: Checked via CPI
  #[account(
    mut,
  )]
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
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub treasury_management_program: Program<'info, TreasuryManagement>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeSubDaoV0>, args: InitializeSubDaoArgsV0) -> Result<()> {
  initialize_mint_windowed_breaker_v0(
    CpiContext::new(
      ctx.accounts.circuit_breaker_program.to_account_info(),
      InitializeMintWindowedBreakerV0 {
        payer: ctx.accounts.payer.to_account_info(),
        circuit_breaker: ctx.accounts.circuit_breaker.to_account_info(),
        mint: ctx.accounts.dnt_mint.to_account_info(),
        mint_authority: ctx.accounts.dnt_mint_authority.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
      },
    ),
    InitializeMintWindowedBreakerArgsV0 {
      authority: args.authority,
      config: CBWindowedCircuitBreakerConfigV0 {
        // No more than 5 epochs worth can be distributed. We should be distributing once per epoch so this
        // should never get triggered.
        window_size_seconds: 5 * u64::try_from(EPOCH_LENGTH).unwrap(),
        threshold_type: CBThresholdType::Absolute,
        threshold: args
          .emission_schedule
          .get_emissions_at(ctx.accounts.clock.unix_timestamp)
          .unwrap(),
      },
      mint_authority: ctx.accounts.sub_dao.key(),
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

  initialize_treasury_management_v0(
    CpiContext::new(
      ctx.accounts.treasury_management_program.to_account_info(),
      InitializeTreasuryManagementV0 {
        payer: ctx.accounts.payer.to_account_info(),
        treasury_management: ctx.accounts.treasury_management.to_account_info(),
        treasury_mint: ctx.accounts.hnt_mint.to_account_info(),
        supply_mint: ctx.accounts.dnt_mint.to_account_info(),
        circuit_breaker: ctx.accounts.treasury_circuit_breaker.to_account_info(),
        treasury: ctx.accounts.treasury.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        circuit_breaker_program: ctx.accounts.circuit_breaker_program.to_account_info(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
      },
    ),
    InitializeTreasuryManagementArgsV0 {
      authority: ctx.accounts.sub_dao.key(),
      curve: args.treasury_curve.into(),
      freeze_unix_time: i64::try_from(next_epoch_ts(ctx.accounts.clock.unix_timestamp)).unwrap(),
      window_config: args.treasury_window_config.into(),
    },
  )?;

  ctx.accounts.dao.num_sub_daos += 1;
  ctx.accounts.sub_dao.set_inner(SubDaoV0 {
    dao: ctx.accounts.dao.key(),
    hotspot_collection: ctx.accounts.hotspot_collection.key(),
    dnt_mint: ctx.accounts.dnt_mint.key(),
    treasury: ctx.accounts.treasury.key(),
    rewards_escrow: ctx.accounts.rewards_escrow.key(),
    authority: args.authority,
    emission_schedule: args.emission_schedule,
    bump_seed: ctx.bumps["sub_dao"],
    total_devices: 0,
  });

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.sub_dao,
  )?;

  Ok(())
}
