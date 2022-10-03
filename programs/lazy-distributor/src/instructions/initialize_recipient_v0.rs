use crate::state::*;
use crate::token_metadata::Metadata;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use shared_utils::resize_to_fit;

#[derive(Accounts)]
pub struct InitializeRecipientV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    seeds = ["lazy-distributor".as_bytes(), lazy_distributor.collection.as_ref(), lazy_distributor.rewards_mint.as_ref()],
    bump = lazy_distributor.bump_seed,
  )]
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    init,
    payer = payer,
    space = std::cmp::max(8 + std::mem::size_of::<RecipientV0>(), recipient.data.borrow_mut().len()),
    seeds = ["recipient".as_bytes(), lazy_distributor.key().as_ref(), mint.key().as_ref()],
    bump,
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    has_one = mint,
    constraint = target_metadata.collection.as_ref().map(|v| v.verified).unwrap(),
    constraint = target_metadata.collection.as_ref().map(|v| v.key == lazy_distributor.collection).unwrap(),
  )]
  pub target_metadata: Box<Account<'info, Metadata>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeRecipientV0>) -> Result<()> {
  ctx.accounts.recipient.set_inner(RecipientV0 {
    mint: ctx.accounts.mint.key(),
    total_rewards: 0,
    current_config_version: 0,
    current_rewards: vec![None; ctx.accounts.lazy_distributor.oracles.len()],
    lazy_distributor: ctx.accounts.lazy_distributor.key(),
    bump_seed: ctx.bumps["recipient"],
  });

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.recipient,
  )?;

  Ok(())
}
