use std::collections::HashSet;

use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{burn, transfer, Burn, Mint, Token, TokenAccount, Transfer},
};
use voter_stake_registry::{
  state::{PositionV0, Registrar},
  VoterStakeRegistry,
};

use crate::{error::ErrorCode, state::*, util::current_epoch, vsr_epoch_info_seeds};
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ClaimRewardsArgsV0 {
  pub epoch: u64,
}

#[derive(Accounts)]
#[instruction(args: ClaimRewardsArgsV0)]
pub struct ClaimRewardsV0<'info> {
  #[account(
    has_one = rewards_mint,
    has_one = registrar,
  )]
  pub vetoken_tracker: Account<'info, VeTokenTrackerV0>,
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
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    mut,
    has_one = vetoken_tracker,
    seeds = ["enrolled_position".as_bytes(), position.key().as_ref()],
    bump,
  )]
  pub enrolled_position: Account<'info, EnrolledPositionV0>,
  #[account(mut)]
  pub rewards_mint: Box<Account<'info, Mint>>,

  #[account(
    seeds = ["vsr_epoch_info".as_bytes(), vetoken_tracker.key().as_ref(), &args.epoch.to_le_bytes()],
    bump,
    constraint = vsr_epoch_info.rewards_issued_at.is_some() @ ErrorCode::EpochNotClosed
  )]
  pub vsr_epoch_info: Box<Account<'info, VsrEpochInfoV0>>,
  #[account(
    mut,
    associated_token::mint = rewards_mint,
    associated_token::authority = vsr_epoch_info,
  )]
  pub rewards_pool: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = position_authority,
    associated_token::mint = rewards_mint,
    associated_token::authority = position_authority,
  )]
  pub enrolled_ata: Box<Account<'info, TokenAccount>>,

  pub vsr_program: Program<'info, VoterStakeRegistry>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
}

impl<'info> ClaimRewardsV0<'info> {
  fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
    let cpi_accounts = Transfer {
      from: self.rewards_pool.to_account_info(),
      to: self.enrolled_ata.to_account_info(),
      authority: self.vsr_epoch_info.to_account_info(),
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }

  fn burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Burn<'info>> {
    let cpi_accounts = Burn {
      from: self.rewards_pool.to_account_info(),
      authority: self.vsr_epoch_info.to_account_info(),
      mint: self.rewards_mint.to_account_info(),
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<ClaimRewardsV0>, args: ClaimRewardsArgsV0) -> Result<()> {
  // load the vetokens information
  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];

  let enrolled_position = &mut ctx.accounts.enrolled_position;

  // check epoch that's being claimed is over
  let epoch = current_epoch(registrar.clock_unix_timestamp());
  if !TESTING {
    require_gt!(epoch, args.epoch, ErrorCode::EpochNotOver);
    if enrolled_position.is_claimed(args.epoch)? {
      return Err(error!(ErrorCode::InvalidClaimEpoch));
    }
  }

  let enrolled_vetokens_at_epoch =
    position.voting_power(voting_mint_config, ctx.accounts.vsr_epoch_info.start_ts())?;

  msg!(
    "Staked {} veHNT at start of epoch with {} total veTokens and {} total rewards",
    enrolled_vetokens_at_epoch,
    ctx.accounts.vsr_epoch_info.vetokens_at_epoch_start,
    ctx.accounts.vsr_epoch_info.rewards_amount
  );

  // calculate the position's share of that epoch's rewards
  // rewards = staking_rewards_issued * staked_vetokens_at_epoch / total_vetokens
  let rewards = u64::try_from(
    enrolled_vetokens_at_epoch
      .checked_mul(ctx.accounts.vsr_epoch_info.rewards_amount as u128)
      .unwrap()
      .checked_div(ctx.accounts.vsr_epoch_info.vetokens_at_epoch_start)
      .unwrap(),
  )
  .unwrap();

  enrolled_position.set_claimed(args.epoch)?;

  let amount_left = ctx.accounts.rewards_pool.amount;
  let amount = std::cmp::min(rewards, amount_left);
  let first_ts = ctx
    .accounts
    .vsr_epoch_info
    .recent_proposals
    .first()
    .unwrap()
    .ts;
  let last_ts = ctx
    .accounts
    .vsr_epoch_info
    .recent_proposals
    .last()
    .unwrap()
    .ts;
  ctx
    .accounts
    .enrolled_position
    .remove_proposals_older_than(first_ts - 1);
  let proposal_set = ctx
    .accounts
    .enrolled_position
    .recent_proposals
    .iter()
    .filter(|p| p.ts <= last_ts)
    .map(|rp| rp.proposal)
    .collect::<HashSet<_>>();

  // Check eligibility based on recent proposals
  let eligible_count = ctx
    .accounts
    .vsr_epoch_info
    .recent_proposals
    .iter()
    .filter(|&proposal| proposal_set.contains(&proposal.proposal))
    .count();
  if eligible_count >= 2 {
    msg!("Position is eligible, transferring");
    transfer(
      ctx
        .accounts
        .transfer_ctx()
        .with_signer(&[vsr_epoch_info_seeds!(ctx.accounts.vsr_epoch_info)]),
      // Due to rounding down of vetokens fall rates it's possible the vetokens on the dao does not exactly match the
      // vetokens remaining. It could be off by a little bit of dust.
      amount,
    )?;
  } else {
    msg!("Position is not eligible, burning");
    burn(
      ctx
        .accounts
        .burn_ctx()
        .with_signer(&[vsr_epoch_info_seeds!(ctx.accounts.vsr_epoch_info)]),
      amount,
    )?;
  }

  Ok(())
}
