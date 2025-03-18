use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer},
};
use helium_sub_daos::{DaoV0, SubDaoV0};

use crate::{maker_seeds, state::*};

#[derive(Accounts)]
pub struct SwapMakerStake<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub update_authority: Signer<'info>,
  #[account(
    has_one = dao,
    has_one = update_authority
  )]
  pub maker: Box<Account<'info, MakerV0>>,
  #[account(
    seeds = ["maker_approval".as_bytes(), rewardable_entity_config.key().as_ref(), maker.key().as_ref()],
    bump = maker_approval.bump_seed,
  )]
  pub maker_approval: Box<Account<'info, MakerApprovalV0>>,
  #[account(
    has_one = sub_dao,
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
    has_one = dao,
    has_one = dnt_mint,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    has_one = hnt_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  pub dnt_mint: Box<Account<'info, Mint>>,
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    associated_token::mint = hnt_mint,
    associated_token::authority = payer,
  )]
  pub new_stake_source: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = dnt_mint,
    associated_token::authority = payer,
  )]
  pub original_stake_destination: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    associated_token::mint = dnt_mint,
    associated_token::authority = maker,
  )]
  pub original_stake: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = hnt_mint,
    associated_token::authority = maker,
  )]
  pub new_escrow: Box<Account<'info, TokenAccount>>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

#[allow(deprecated)]
pub fn handler(ctx: Context<SwapMakerStake>) -> Result<()> {
  let seeds = maker_seeds!(ctx.accounts.maker);

  // Transfer original stake back to payer
  token::transfer(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      Transfer {
        from: ctx.accounts.original_stake.to_account_info(),
        to: ctx.accounts.original_stake_destination.to_account_info(),
        authority: ctx.accounts.maker.to_account_info(),
      },
      &[seeds],
    ),
    ctx.accounts.original_stake.amount,
  )?;
  token::close_account(CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    CloseAccount {
      account: ctx.accounts.original_stake.to_account_info(),
      destination: ctx.accounts.payer.to_account_info(),
      authority: ctx.accounts.maker.to_account_info(),
    },
    &[seeds],
  ))?;

  // Transfer new stake to maker
  token::transfer(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      Transfer {
        from: ctx.accounts.new_stake_source.to_account_info(),
        to: ctx.accounts.new_escrow.to_account_info(),
        authority: ctx.accounts.payer.to_account_info(),
      },
    ),
    ctx.accounts.rewardable_entity_config.staking_requirement,
  )?;

  Ok(())
}
