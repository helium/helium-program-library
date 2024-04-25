use crate::state::*;
use crate::token_metadata::Metadata;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

#[derive(Accounts)]
pub struct InitializeRecipientV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    seeds = ["lazy_distributor".as_bytes(), lazy_distributor.rewards_mint.as_ref()],
    bump = lazy_distributor.bump_seed,
  )]
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<RecipientV0>(),
    seeds = ["recipient".as_bytes(), lazy_distributor.key().as_ref(), mint.key().as_ref()],
    bump,
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    seeds = ["metadata".as_bytes(), mpl_token_metadata::ID.as_ref(), mint.key().as_ref()],
    seeds::program = mpl_token_metadata::ID,
    bump,
    has_one = mint
  )]
  pub target_metadata: Box<Account<'info, Metadata>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeRecipientV0>) -> Result<()> {
  ctx.accounts.recipient.set_inner(RecipientV0 {
    asset: ctx.accounts.mint.key(),
    total_rewards: 0,
    current_config_version: 0,
    current_rewards: vec![None; ctx.accounts.lazy_distributor.oracles.len()],
    lazy_distributor: ctx.accounts.lazy_distributor.key(),
    bump_seed: ctx.bumps["recipient"],
    destination: Pubkey::default(),
    reserved: 0,
  });

  Ok(())
}
