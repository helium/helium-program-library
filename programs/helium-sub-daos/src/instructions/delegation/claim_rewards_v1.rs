use std::collections::HashSet;

use anchor_lang::{prelude::*, solana_program::pubkey};
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use circuit_breaker::{
  cpi::{
    accounts::{BurnV0, TransferV0},
    burn_v0, transfer_v0,
  },
  AccountWindowedCircuitBreakerV0, BurnArgsV0, CircuitBreaker, TransferArgsV0,
};
use voter_stake_registry::{
  cpi::{accounts::ClearRecentProposalsV0, clear_recent_proposals_v0},
  state::{PositionV0, Registrar},
  ClearRecentProposalsArgsV0, VoterStakeRegistry,
};

use crate::{current_epoch, dao_seeds, error::ErrorCode, state::*, TESTING};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ClaimRewardsArgsV0 {
  pub epoch: u64,
}

const TUKTUK_SIGNER_KEY: Pubkey = pubkey!("8m6iyXwcu8obaXdqKwzBqHE5HM2tRZZfSXV5qNALiPk4");

#[derive(Accounts)]
#[instruction(args: ClaimRewardsArgsV0)]
pub struct ClaimRewardsV1<'info> {
  #[account(
    mut,
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
  /// CHECK: By constraint
  #[account(
    constraint = (position_authority.is_signer && position_authority.key() == payer.key()) || payer.key() == TUKTUK_SIGNER_KEY
  )]
  pub position_authority: AccountInfo<'info>,
  #[account(mut)]
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    mut,
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
    bump = delegated_position.bump_seed,
  )]
  pub delegated_position: Account<'info, DelegatedPositionV0>,

  #[account(mut)]
  pub hnt_mint: Box<Account<'info, Mint>>,

  #[account(
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump = dao_epoch_info.bump_seed,
    // Ensure that a pre HIP-138 claim can't accidentally be done.
    constraint = dao_epoch_info.delegation_rewards_issued > 0,
    constraint = dao_epoch_info.done_issuing_rewards @ ErrorCode::EpochNotClosed
  )]
  pub dao_epoch_info: Box<Account<'info, DaoEpochInfoV0>>,
  #[account(mut)]
  pub delegator_pool: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = hnt_mint,
    associated_token::authority = position_authority,
  )]
  pub delegator_ata: Box<Account<'info, TokenAccount>>,

  /// CHECK: checked via cpi
  #[account(
    mut,
    seeds = ["account_windowed_breaker".as_bytes(), delegator_pool.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = delegator_pool_circuit_breaker.bump_seed,
  )]
  pub delegator_pool_circuit_breaker: Box<Account<'info, AccountWindowedCircuitBreakerV0>>,

  pub vsr_program: Program<'info, VoterStakeRegistry>,
  pub system_program: Program<'info, System>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
  #[account(mut)]
  pub payer: Signer<'info>,
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

  fn burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, BurnV0<'info>> {
    let cpi_accounts = BurnV0 {
      mint: self.hnt_mint.to_account_info(),
      from: self.delegator_pool.to_account_info(),
      circuit_breaker: self.delegator_pool_circuit_breaker.to_account_info(),
      token_program: self.token_program.to_account_info(),
      owner: self.dao.to_account_info(),
    };

    CpiContext::new(self.circuit_breaker_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<ClaimRewardsV1>, args: ClaimRewardsArgsV0) -> Result<()> {
  // load the vehnt information
  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar;
  let dao_epoch_info_ts = ctx.accounts.dao_epoch_info.start_ts();
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];

  let delegated_position = &mut ctx.accounts.delegated_position;

  // check epoch that's being claimed is over
  let epoch = current_epoch(registrar.clock_unix_timestamp());
  if !TESTING {
    require_gt!(epoch, args.epoch, ErrorCode::EpochNotOver);
    if delegated_position.is_claimed(args.epoch)? {
      msg!("Rewards already claimed, skipping");
      return Ok(());
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
      .unwrap_or(0),
  )
  .unwrap();

  delegated_position.set_claimed(args.epoch)?;

  let first_ts = ctx
    .accounts
    .dao_epoch_info
    .recent_proposals
    .last()
    .unwrap()
    .ts;

  // Only clear when we're claiming the most recent epoch. We don't want to clear proposals when we're
  // claiming later in the bitmap but earlier claims haven't gone through yet.
  if epoch == ctx.accounts.delegated_position.last_claimed_epoch + 1 {
    // Only clear if there are old proposals that should be cleared.
    if ctx
      .accounts
      .position
      .recent_proposals
      .iter()
      .any(|p| p.ts < first_ts)
    {
      clear_recent_proposals_v0(
        CpiContext::new_with_signer(
          ctx.accounts.vsr_program.to_account_info(),
          ClearRecentProposalsV0 {
            position: ctx.accounts.position.to_account_info(),
            registrar: ctx.accounts.registrar.to_account_info(),
            dao: ctx.accounts.dao.to_account_info(),
          },
          &[dao_seeds!(ctx.accounts.dao)],
        ),
        ClearRecentProposalsArgsV0 {
          ts: first_ts,
          dao_bump: ctx.accounts.dao.bump_seed,
        },
      )?;
    }
  }

  let last_ts = ctx
    .accounts
    .dao_epoch_info
    .recent_proposals
    .first()
    .unwrap()
    .ts;
  let proposal_set = ctx
    .accounts
    .position
    .recent_proposals
    .iter()
    .filter(|p| p.ts <= last_ts && p.ts >= first_ts)
    .map(|rp| rp.proposal)
    .collect::<HashSet<_>>();

  // Check eligibility based on recent proposals
  let eligible_count = ctx
    .accounts
    .dao_epoch_info
    .recent_proposals
    .iter()
    .filter(|&proposal| {
      proposal_set.contains(&proposal.proposal) || proposal.is_in_progress(dao_epoch_info_ts)
    })
    .count();
  let not_four_proposals = ctx.accounts.dao_epoch_info.recent_proposals.len() < 4
    || ctx
      .accounts
      .dao_epoch_info
      .recent_proposals
      .iter()
      .filter(|p| p.proposal != Pubkey::default())
      .count()
      < 4;

  let amount_left = ctx.accounts.delegator_pool.amount;
  let amount = std::cmp::min(rewards, amount_left);

  if !not_four_proposals && eligible_count < 2 {
    burn_v0(
      ctx
        .accounts
        .burn_ctx()
        .with_signer(&[dao_seeds!(ctx.accounts.dao)]),
      BurnArgsV0 { amount },
    )?;
  } else {
    transfer_v0(
      ctx
        .accounts
        .transfer_ctx()
        .with_signer(&[dao_seeds!(ctx.accounts.dao)]),
      // Due to rounding down of vehnt fall rates it's possible the vehnt on the dao does not exactly match the
      // vehnt remaining. It could be off by a little bit of dust.
      TransferArgsV0 { amount },
    )?;
  }

  Ok(())
}
