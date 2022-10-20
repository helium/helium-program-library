use crate::{state::*, EPOCH_LENGTH};
use anchor_lang::prelude::*;
use circuit_breaker::{WindowedCircuitBreakerConfigV0, ThresholdType};
use shared_utils::resize_to_fit;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{set_authority, SetAuthority, TokenAccount, Mint, Token};
use circuit_breaker::{
  CircuitBreaker,
  cpi::{accounts::InitializeMintWindowedBreakerV0, initialize_mint_windowed_breaker_v0},
  InitializeMintWindowedBreakerArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeSubDaoArgsV0 {
  pub authority: Pubkey,
  pub emission_schedule: Vec<EmissionScheduleItem>
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
  #[account(
    constraint = treasury.mint == hnt_mint.key()
  )]
  pub treasury: Box<Account<'info, TokenAccount>>,
  #[account(
    constraint = rewards_escrow.mint == dnt_mint.key()
  )]
  pub rewards_escrow: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
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
      config: WindowedCircuitBreakerConfigV0 {
        // No more than 5 epochs worth can be distributed. We should be distributing once per epoch so this
        // should never get triggered. 
        window_size_seconds: 5 * u64::try_from(EPOCH_LENGTH).unwrap(),
        threshold_type: ThresholdType::Absolute,
        threshold: args.emission_schedule.get_emissions_at(ctx.accounts.clock.unix_timestamp).unwrap()
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
