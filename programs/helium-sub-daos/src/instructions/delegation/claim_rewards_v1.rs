use std::collections::HashSet;

use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{burn, Burn, Mint, Token, TokenAccount},
};
use circuit_breaker::{
  cpi::{accounts::TransferV0, transfer_v0},
  CircuitBreaker, TransferArgsV0,
};
use voter_stake_registry::{
  state::{PositionV0, Registrar},
  VoterStakeRegistry,
};

use crate::{current_epoch, dao_seeds, error::ErrorCode, state::*, TESTING};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ClaimRewardsArgsV0 {
  pub epoch: u64,
}

#[derive(Accounts)]
#[instruction(args: ClaimRewardsArgsV0)]
pub struct ClaimRewardsV1<'info> {
  #[account(
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    seeds::program = vsr_program.key(),
    bump = position.bump_seed,
    has_one = mint,
    has_one = registrar,
  )]
  pub position: Box<Account<'info, PositionV0>>,
  #[account(mut)]
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  #[account(mut)]
  pub position_authority: Signer<'info>,
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    has_one = registrar,
    has_one = hnt_mint,
    has_one = delegator_pool,
  )]
  pub dao: Box<Account<'info, DaoV0>>,

  #[account(
    mut,
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

  pub hnt_mint: Box<Account<'info, Mint>>,

  #[account(
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump,
    constraint = dao_epoch_info.done_issuing_rewards @ ErrorCode::EpochNotClosed
  )]
  pub dao_epoch_info: Box<Account<'info, DaoEpochInfoV0>>,
  #[account(mut)]
  pub delegator_pool: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = position_authority,
    associated_token::mint = hnt_mint,
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

impl<'info> ClaimRewardsV1<'info> {
  fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, TransferV0<'info>> {
    let cpi_accounts = TransferV0 {
      from: self.delegator_pool.to_account_info(),
      to: self.delegator_ata.to_account_info(),
      owner: self.dao.to_account_info(),
      circuit_breaker: self.delegator_pool_circuit_breaker.to_account_info(),
      token_program: self.token_program.to_account_info(),
    };

    CpiContext::new(self.circuit_breaker_program.to_account_info(), cpi_accounts)
  }

  fn burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Burn<'info>> {
    let cpi_accounts = Burn {
      mint: self.mint.to_account_info(),
      authority: self.position_authority.to_account_info(),
      from: self.delegator_ata.to_account_info(),
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<ClaimRewardsV1>, args: ClaimRewardsArgsV0) -> Result<()> {
  // load the vehnt information
  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];

  let delegated_position = &mut ctx.accounts.delegated_position;

  // check epoch that's being claimed is over
  let epoch = current_epoch(registrar.clock_unix_timestamp());
  if !TESTING {
    require_gt!(epoch, args.epoch, ErrorCode::EpochNotOver);
    if delegated_position.is_claimed(args.epoch)? {
      return Err(error!(ErrorCode::InvalidClaimEpoch));
    }
  }

  let epoch_start_ts = ctx.accounts.dao_epoch_info.start_ts();
  let delegated_vehnt_at_epoch = if delegated_position.expiration_ts > epoch_start_ts {
    position.voting_power(voting_mint_config, epoch_start_ts)?
  } else {
    0
  };

  msg!("Staked {} veHNT at start of epoch with {} total veHNT delegated to dao and {} total rewards to dao",
    delegated_vehnt_at_epoch,
    ctx.accounts.dao_epoch_info.vehnt_at_epoch_start,
    ctx.accounts.dao_epoch_info.delegation_rewards_issued
  );

  // calculate the position's share of that epoch's rewards
  // rewards = staking_rewards_issued * staked_vehnt_at_epoch / total_vehnt
  let rewards = u64::try_from(
    delegated_vehnt_at_epoch
      .checked_mul(ctx.accounts.dao_epoch_info.delegation_rewards_issued as u128)
      .unwrap()
      .checked_div(ctx.accounts.dao_epoch_info.vehnt_at_epoch_start as u128)
      .unwrap(),
  )
  .unwrap();

  delegated_position.set_claimed(args.epoch)?;

  let first_ts = ctx.accounts.dao.recent_proposals.last().unwrap().ts;
  let last_ts = ctx.accounts.dao.recent_proposals.first().unwrap().ts;
  ctx
    .accounts
    .delegated_position
    .remove_proposals_older_than(first_ts - 1);
  let proposal_set = ctx
    .accounts
    .delegated_position
    .recent_proposals
    .iter()
    .filter(|p| p.ts <= last_ts)
    .map(|rp| rp.proposal)
    .collect::<HashSet<_>>();
  // Check eligibility based on recent proposals
  let eligible_count = ctx
    .accounts
    .dao
    .recent_proposals
    .iter()
    .filter(|&proposal| proposal_set.contains(&proposal.proposal))
    .count();
  let not_four_proposals = ctx.accounts.dao.recent_proposals.len() < 4
    || ctx
      .accounts
      .dao
      .recent_proposals
      .iter()
      .filter(|p| p.proposal != Pubkey::default())
      .count()
      < 4;

  let amount_left = ctx.accounts.delegator_pool.amount;
  let amount = std::cmp::min(rewards, amount_left);
  transfer_v0(
    ctx
      .accounts
      .transfer_ctx()
      .with_signer(&[dao_seeds!(ctx.accounts.dao)]),
    // Due to rounding down of vehnt fall rates it's possible the vehnt on the dao does not exactly match the
    // vehnt remaining. It could be off by a little bit of dust.
    TransferArgsV0 { amount },
  )?;

  if !not_four_proposals && eligible_count < 2 {
    msg!(
      "Position is not eligible, burning rewards. Position proposals {:?}, recent proposals {:?}",
      ctx.accounts.delegated_position.recent_proposals,
      ctx.accounts.dao.recent_proposals
    );
    burn(ctx.accounts.burn_ctx(), amount)?;
  }

  Ok(())
}
