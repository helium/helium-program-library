use crate::{construct_issue_hst_kickoff_ix, current_epoch, state::*, EPOCH_LENGTH};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::native_token::LAMPORTS_PER_SOL;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{set_authority, SetAuthority, TokenAccount};
use anchor_spl::token::{Mint, Token};
use circuit_breaker::{
  cpi::{accounts::InitializeMintWindowedBreakerV0, initialize_mint_windowed_breaker_v0},
  CircuitBreaker, InitializeMintWindowedBreakerArgsV0,
};
use circuit_breaker::{ThresholdType, WindowedCircuitBreakerConfigV0};
use clockwork_sdk::{cpi::thread_create, state::Trigger, ThreadProgram};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeDaoArgsV0 {
  pub authority: Pubkey,
  pub emission_schedule: Vec<EmissionScheduleItem>,
  pub hst_emission_schedule: Vec<PercentItem>,
  pub net_emissions_cap: u64,
  pub registrar: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitializeDaoArgsV0)]
pub struct InitializeDaoV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<DaoV0>() + (std::mem::size_of::<EmissionScheduleItem>() * args.emission_schedule.len()),
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

  /// CHECK: handled by thread_create
  #[account(
    mut,
    seeds = [b"thread", dao.key().as_ref(), b"issue_hst"],
    seeds::program = clockwork.key(),
    bump
  )]
  pub thread: AccountInfo<'info>,
  pub clockwork: Program<'info, ThreadProgram>,
}

pub fn handler(ctx: Context<InitializeDaoV0>, args: InitializeDaoArgsV0) -> Result<()> {
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
        window_size_seconds: 5 * u64::try_from(EPOCH_LENGTH).unwrap(),
        threshold_type: ThresholdType::Absolute,
        threshold: 5
          * args
            .emission_schedule
            .get_emissions_at(Clock::get()?.unix_timestamp)
            .unwrap(),
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

  ctx.accounts.dao.set_inner(DaoV0 {
    hst_emission_schedule: args.hst_emission_schedule,
    dc_mint: ctx.accounts.dc_mint.key(),
    hnt_mint: ctx.accounts.hnt_mint.key(),
    authority: args.authority,
    num_sub_daos: 0,
    emission_schedule: args.emission_schedule,
    registrar: args.registrar,
    bump_seed: ctx.bumps["dao"],
    net_emissions_cap: args.net_emissions_cap,
    hst_pool: ctx.accounts.hst_pool.key(),
  });

  let curr_ts = Clock::get()?.unix_timestamp;
  let epoch = current_epoch(curr_ts);

  let dao_key = ctx.accounts.dao.key();
  let dao_ei_seeds: &[&[u8]] = &[
    "dao_epoch_info".as_bytes(),
    dao_key.as_ref(),
    &epoch.to_le_bytes(),
  ];
  let dao_epoch_info = Pubkey::find_program_address(dao_ei_seeds, &crate::id()).0;

  let kickoff_ix = construct_issue_hst_kickoff_ix(
    ctx.accounts.dao.key(),
    ctx.accounts.hnt_mint.key(),
    ctx.accounts.system_program.key(),
    ctx.accounts.token_program.key(),
    ctx.accounts.circuit_breaker_program.key(),
  );

  // initialize thread
  let signer_seeds: &[&[&[u8]]] = &[&[
    "dao".as_bytes(),
    ctx.accounts.hnt_mint.to_account_info().key.as_ref(),
    &[ctx.bumps["dao"]],
  ]];
  thread_create(
    CpiContext::new_with_signer(
      ctx.accounts.clockwork.to_account_info(),
      clockwork_sdk::cpi::ThreadCreate {
        authority: ctx.accounts.dao.to_account_info(),
        payer: ctx.accounts.payer.to_account_info(),
        thread: ctx.accounts.thread.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      signer_seeds,
    ),
    LAMPORTS_PER_SOL / 100,
    "issue_hst".to_string().as_bytes().to_vec(),
    vec![kickoff_ix.into()],
    Trigger::Account {
      address: dao_epoch_info,
      offset: 8,
      size: 1,
    },
  )?;

  Ok(())
}
