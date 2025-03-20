use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use helium_sub_daos::{DaoV0, SubDaoV0};

use crate::state::*;

#[derive(Accounts)]
pub struct ApproveMakerV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,

  #[account(
    has_one = authority,
    has_one = sub_dao,
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = hnt_mint,
    associated_token::authority = maker,
    constraint = escrow.amount >= rewardable_entity_config.staking_requirement
  )]
  pub escrow: Box<Account<'info, TokenAccount>>,
  pub authority: Signer<'info>,

  #[account(
    has_one = dao,
  )]
  pub maker: Box<Account<'info, MakerV0>>,
  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<MakerApprovalV0>(),
    seeds = ["maker_approval".as_bytes(), rewardable_entity_config.key().as_ref(), maker.key().as_ref()],
    bump,
  )]
  pub maker_approval: Box<Account<'info, MakerApprovalV0>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  #[account(
    has_one = hnt_mint,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
}

pub fn handler(ctx: Context<ApproveMakerV0>) -> Result<()> {
  ctx.accounts.maker_approval.set_inner(MakerApprovalV0 {
    rewardable_entity_config: ctx.accounts.rewardable_entity_config.key(),
    maker: ctx.accounts.maker.key(),
    bump_seed: ctx.bumps.maker_approval,
  });

  Ok(())
}
