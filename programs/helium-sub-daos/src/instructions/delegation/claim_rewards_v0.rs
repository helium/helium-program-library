use crate::{current_epoch, error::ErrorCode, state::*, EPOCH_LENGTH, TESTING};
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use circuit_breaker::{
  cpi::{accounts::TransferV0, transfer_v0},
  CircuitBreaker, TransferArgsV0,
};
use voter_stake_registry::state::{PositionV0, Registrar};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ClaimRewardsArgsV0 {
  pub epoch: u64,
}

#[derive(Accounts)]
#[instruction(args: ClaimRewardsArgsV0)]
pub struct ClaimRewardsV0<'info> {
  #[account(
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    seeds::program = vsr_program.key(),
    bump = position.bump_seed,
    has_one = mint,
    has_one = registrar,
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  #[account(mut)]
  pub position_authority: Signer<'info>,
  pub registrar: AccountLoader<'info, Registrar>,
  #[account(
    has_one = registrar
  )]
  pub dao: Box<Account<'info, DaoV0>>,

  #[account(
    mut,
    has_one = delegator_pool,
    has_one = dnt_mint,
    has_one = dao,
  )]
  pub sub_dao: Account<'info, SubDaoV0>,
  #[account(
    mut,
    has_one = sub_dao,
    seeds = ["delegated_position".as_bytes(), position.key().as_ref()],
    bump,
  )]
  pub delegated_position: Account<'info, DelegatedPositionV0>,

  pub dnt_mint: Box<Account<'info, Mint>>,

  #[account(
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(mut)]
  pub delegator_pool: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = position_authority,
    associated_token::mint = dnt_mint,
    associated_token::authority = position_authority,
  )]
  pub delegator_ata: Box<Account<'info, TokenAccount>>,

  /// CHECK: checked via cpi
  #[account(
    mut,
    seeds = ["account_windowed_breaker".as_bytes(), delegator_pool.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump
  )]
  pub delegator_pool_circuit_breaker: AccountInfo<'info>,

  ///CHECK: constraints
  #[account(address = voter_stake_registry::ID)]
  pub vsr_program: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> ClaimRewardsV0<'info> {
  fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, TransferV0<'info>> {
    let cpi_accounts = TransferV0 {
      from: self.delegator_pool.to_account_info(),
      to: self.delegator_ata.to_account_info(),
      owner: self.sub_dao.to_account_info(),
      circuit_breaker: self.delegator_pool_circuit_breaker.to_account_info(),
      token_program: self.token_program.to_account_info(),
      clock: self.clock.to_account_info(),
    };

    CpiContext::new(self.circuit_breaker_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<ClaimRewardsV0>, args: ClaimRewardsArgsV0) -> Result<()> {
  // load the vehnt information
  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar.load()?;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];

  let delegated_position = &mut ctx.accounts.delegated_position;

  // check epoch that's being claimed is over
  let epoch = current_epoch(ctx.accounts.registrar.load()?.clock_unix_timestamp());
  if !TESTING {
    require_gt!(epoch, args.epoch, ErrorCode::EpochNotOver,);
    require_eq!(
      args.epoch,
      delegated_position.last_claimed_epoch + 1,
      ErrorCode::InvalidClaimEpoch
    )
  }

  let delegated_vehnt_at_epoch = position.voting_power(
    voting_mint_config,
    ctx.accounts.sub_dao_epoch_info.start_ts(),
  )?;

  msg!("Staked {} veHNT at start of epoch with {} total veHNT delegated to subdao and {} total rewards to subdao", 
    delegated_vehnt_at_epoch,
    ctx.accounts.sub_dao_epoch_info.vehnt_at_epoch_start,
    ctx.accounts.sub_dao_epoch_info.delegation_rewards_issued
  );

  // Invariant check, they should never have more vehnt than the total vehnt at epoch start
  require_gte!(
    ctx.accounts.sub_dao_epoch_info.vehnt_at_epoch_start,
    delegated_vehnt_at_epoch,
  );
  // calculate the position's share of that epoch's rewards
  // rewards = staking_rewards_issued * staked_vehnt_at_epoch / total_vehnt
  let rewards = delegated_vehnt_at_epoch
    .checked_mul(ctx.accounts.sub_dao_epoch_info.delegation_rewards_issued)
    .unwrap()
    .checked_div(ctx.accounts.sub_dao_epoch_info.vehnt_at_epoch_start)
    .unwrap();

  delegated_position.last_claimed_epoch = epoch;

  transfer_v0(
    ctx.accounts.transfer_ctx().with_signer(&[&[
      b"sub_dao",
      ctx.accounts.sub_dao.dnt_mint.as_ref(),
      &[ctx.accounts.sub_dao.bump_seed],
    ]]),
    TransferArgsV0 { amount: rewards },
  )?;
  Ok(())
}
