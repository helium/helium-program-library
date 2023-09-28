use std::str::FromStr;

use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use circuit_breaker::{
  cpi::{accounts::TransferV0, transfer_v0},
  CircuitBreaker, TransferArgsV0,
};
use voter_stake_registry::{
  state::{PositionV0, Registrar},
  VoterStakeRegistry,
};

#[account]
pub struct Block {}

#[derive(Accounts)]
pub struct TempClaimFailedClaims<'info> {
  #[account(
    mut,
    address = Pubkey::from_str("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW").unwrap()
  )]
  pub authority: Signer<'info>,
  // Ensure this is run once per wallet
  #[account(
    init,
    payer = authority,
    seeds = [b"block".as_ref(), sub_dao_epoch_info.key().as_ref(), position.key().as_ref()],
    bump,
    space = 8
  )]
  pub block: Account<'info, Block>,
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
  /// CHECK: Not the signer since this is a backfill
  pub position_authority: AccountInfo<'info>,
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    has_one = registrar
  )]
  pub dao: Box<Account<'info, DaoV0>>,

  #[account(
    has_one = delegator_pool,
    has_one = dnt_mint,
    has_one = dao,
  )]
  pub sub_dao: Account<'info, SubDaoV0>,
  #[account(
    has_one = sub_dao,
    seeds = ["delegated_position".as_bytes(), position.key().as_ref()],
    bump,
  )]
  pub delegated_position: Account<'info, DelegatedPositionV0>,

  pub dnt_mint: Box<Account<'info, Mint>>,

  #[account(
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &19624_u64.to_le_bytes()],
    bump = sub_dao_epoch_info.bump_seed,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(mut)]
  pub delegator_pool: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = authority,
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

  pub vsr_program: Program<'info, VoterStakeRegistry>,
  pub system_program: Program<'info, System>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
}

impl<'info> TempClaimFailedClaims<'info> {
  fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, TransferV0<'info>> {
    let cpi_accounts = TransferV0 {
      from: self.delegator_pool.to_account_info(),
      to: self.delegator_ata.to_account_info(),
      owner: self.sub_dao.to_account_info(),
      circuit_breaker: self.delegator_pool_circuit_breaker.to_account_info(),
      token_program: self.token_program.to_account_info(),
    };

    CpiContext::new(self.circuit_breaker_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<TempClaimFailedClaims>) -> Result<()> {
  // load the vehnt information
  let position = &ctx.accounts.position;
  let registrar = &ctx.accounts.registrar;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];

  let delegated_vehnt_at_epoch = position.voting_power(
    voting_mint_config,
    ctx.accounts.sub_dao_epoch_info.start_ts(),
  )?;

  msg!("Staked {} veHNT at start of epoch with {} total veHNT delegated to subdao and {} total rewards to subdao", 
    delegated_vehnt_at_epoch,
    ctx.accounts.sub_dao_epoch_info.vehnt_at_epoch_start,
    ctx.accounts.sub_dao_epoch_info.delegation_rewards_issued
  );

  // calculate the position's share of that epoch's rewards
  // rewards = staking_rewards_issued * staked_vehnt_at_epoch / total_vehnt
  let rewards = u64::try_from(
    (delegated_vehnt_at_epoch as u128)
      .checked_mul(ctx.accounts.sub_dao_epoch_info.delegation_rewards_issued as u128)
      .unwrap()
      .checked_div(ctx.accounts.sub_dao_epoch_info.vehnt_at_epoch_start as u128)
      .unwrap(),
  )
  .unwrap();

  let amount_left = ctx.accounts.delegator_pool.amount;
  transfer_v0(
    ctx.accounts.transfer_ctx().with_signer(&[&[
      b"sub_dao",
      ctx.accounts.sub_dao.dnt_mint.as_ref(),
      &[ctx.accounts.sub_dao.bump_seed],
    ]]),
    // Due to rounding down of vehnt fall rates it's possible the vehnt on the dao does not exactly match the
    // vehnt remaining. It could be off by a little bit of dust.
    TransferArgsV0 {
      amount: std::cmp::min(rewards, amount_left),
    },
  )?;
  Ok(())
}
