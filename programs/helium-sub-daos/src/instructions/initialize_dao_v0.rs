use std::array;

use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{
    set_authority, spl_token::instruction::AuthorityType, Mint, SetAuthority, Token, TokenAccount,
  },
};
use circuit_breaker::{
  cpi::{
    accounts::{InitializeAccountWindowedBreakerV0, InitializeMintWindowedBreakerV0},
    initialize_account_windowed_breaker_v0, initialize_mint_windowed_breaker_v0,
  },
  CircuitBreaker, InitializeAccountWindowedBreakerArgsV0, InitializeMintWindowedBreakerArgsV0,
  ThresholdType, ThresholdType as CBThresholdType, WindowedCircuitBreakerConfigV0,
  WindowedCircuitBreakerConfigV0 as CBWindowedCircuitBreakerConfigV0,
};

use crate::{dao_seeds, state::*, EPOCH_LENGTH};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeDaoArgsV0 {
  pub authority: Pubkey,
  pub emission_schedule: Vec<EmissionScheduleItem>,
  pub hst_emission_schedule: Vec<PercentItem>,
  pub net_emissions_cap: u64,
  pub registrar: Pubkey,
  pub proposal_namespace: Pubkey,
  pub delegator_rewards_percent: u64,
}

#[derive(Accounts)]
#[instruction(args: InitializeDaoArgsV0)]
pub struct InitializeDaoV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<DaoV0>() + (std::mem::size_of::<EmissionScheduleItem>() * args.emission_schedule.len()) +  (std::mem::size_of::<PercentItem>() * args.hst_emission_schedule.len()),
    seeds = ["dao".as_bytes(), hnt_mint.key().as_ref()],
    bump,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(mut)]
  pub hnt_mint: Box<Account<'info, Mint>>,
  pub hnt_mint_authority: Signer<'info>,
  pub hnt_freeze_authority: Signer<'info>,
  /// CHECK: Verified by CPI
  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), hnt_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump
  )]
  pub hnt_circuit_breaker: AccountInfo<'info>,
  pub dc_mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = hnt_mint
  )]
  pub hst_pool: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  /// CHECK: Initialized via cpi
  #[account(
    mut,
    seeds = ["account_windowed_breaker".as_bytes(), delegator_pool.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump
  )]
  pub delegator_pool_circuit_breaker: AccountInfo<'info>,
  #[account(
    token::mint = hnt_mint
  )]
  pub rewards_escrow: Box<Account<'info, TokenAccount>>,

  #[account(
    init,
    payer = payer,
    associated_token::mint = hnt_mint,
    associated_token::authority = dao,
  )]
  pub delegator_pool: Box<Account<'info, TokenAccount>>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<InitializeDaoV0>, args: InitializeDaoArgsV0) -> Result<()> {
  require_gte!(
    100_u64.checked_mul(10_0000000).unwrap(),
    args.delegator_rewards_percent,
  );
  ctx.accounts.dao.set_inner(DaoV0 {
    delegator_rewards_percent: args.delegator_rewards_percent,
    hst_emission_schedule: args.hst_emission_schedule,
    dc_mint: ctx.accounts.dc_mint.key(),
    hnt_mint: ctx.accounts.hnt_mint.key(),
    authority: args.authority,
    num_sub_daos: 0,
    emission_schedule: args.emission_schedule.clone(),
    registrar: args.registrar,
    bump_seed: ctx.bumps["dao"],
    net_emissions_cap: args.net_emissions_cap,
    hst_pool: ctx.accounts.hst_pool.key(),
    delegator_pool: ctx.accounts.delegator_pool.key(),
    rewards_escrow: ctx.accounts.rewards_escrow.key(),
    recent_proposals: array::from_fn(|_| RecentProposal::default()),
    proposal_namespace: args.proposal_namespace,
  });
  initialize_account_windowed_breaker_v0(
    CpiContext::new_with_signer(
      ctx.accounts.circuit_breaker_program.to_account_info(),
      InitializeAccountWindowedBreakerV0 {
        payer: ctx.accounts.payer.to_account_info(),
        circuit_breaker: ctx
          .accounts
          .delegator_pool_circuit_breaker
          .to_account_info(),
        token_account: ctx.accounts.delegator_pool.to_account_info(),
        owner: ctx.accounts.dao.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      &[dao_seeds!(&ctx.accounts.dao)],
    ),
    InitializeAccountWindowedBreakerArgsV0 {
      authority: args.authority,
      config: CBWindowedCircuitBreakerConfigV0 {
        window_size_seconds: u64::try_from(EPOCH_LENGTH).unwrap(),
        threshold_type: CBThresholdType::Absolute,
        threshold: 5 * args.emission_schedule[0].emissions_per_epoch,
      },
      owner: ctx.accounts.dao.key(),
    },
  )?;
  initialize_mint_windowed_breaker_v0(
    CpiContext::new(
      ctx.accounts.circuit_breaker_program.to_account_info(),
      InitializeMintWindowedBreakerV0 {
        payer: ctx.accounts.payer.to_account_info(),
        circuit_breaker: ctx.accounts.hnt_circuit_breaker.to_account_info(),
        mint: ctx.accounts.hnt_mint.to_account_info(),
        mint_authority: ctx.accounts.hnt_mint_authority.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
    ),
    InitializeMintWindowedBreakerArgsV0 {
      authority: args.authority,
      config: WindowedCircuitBreakerConfigV0 {
        // No more than 5 epochs worth can be distributed. We should be distributing once per epoch so this
        // should never get triggered.
        window_size_seconds: u64::try_from(EPOCH_LENGTH).unwrap(),
        threshold_type: ThresholdType::Absolute,
        threshold: 5 * args.emission_schedule[0].emissions_per_epoch,
      },
      mint_authority: ctx.accounts.dao.key(),
    },
  )?;
  set_authority(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      SetAuthority {
        account_or_mint: ctx.accounts.hnt_mint.to_account_info(),
        current_authority: ctx.accounts.hnt_freeze_authority.to_account_info(),
      },
    ),
    AuthorityType::FreezeAccount,
    Some(ctx.accounts.dao.key()),
  )?;

  Ok(())
}
